from fastapi import APIRouter, Depends, HTTPException, Query, status, File, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Dict, Any, Optional
from database import get_db
from models import AdminUser, TurbidityData, TurbidityDataS2
from security import get_current_admin, verify_password
from datetime import datetime
import pandas as pd
import io
import json

router = APIRouter()

@router.post("/upload-data", status_code=status.HTTP_201_CREATED)
async def upload_turbidity_data(
    file: UploadFile = File(...),
    satellite: str = Query("S3", description="Target satellite: S2 or S3"),
    db: AsyncSession = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin)
):
    """
    Ingests tabular or JSON data into the database.
    Routes to the correct table based on the satellite parameter.
    Supports .csv, .txt, .xlsx, and .json.
    """
    new_records = []
    is_s2 = satellite == "S2"
    
    def make_record(dt_aware, geom_wkt, pt_data):
        """Create the correct model instance based on satellite type."""
        if is_s2:
            return TurbidityDataS2(
                measurement_date=dt_aware,
                geom=geom_wkt,
                tur_eljaiek=pt_data.get("TUR_Eljaiek"),
                tur_dogliotti2015=pt_data.get("TUR_Dogliotti2015"),
                tur_nechad2009_665=pt_data.get("TUR_Nechad2009_665")
            )
        else:
            return TurbidityData(
                measurement_date=dt_aware,
                geom=geom_wkt,
                rrs_665=pt_data.get("Rrs_665"),
                tt_pred=pt_data.get("TT_pred")
            )
    
    try:
        contents = await file.read()
        filename = file.filename.lower()
        
        if filename.endswith(".json"):
            # Custom JSON parsing
            data_input = json.loads(contents.decode("utf-8"))
            
            if isinstance(data_input, dict):
                # Old format: {"YYYY-MM-DD": [ {...}, {...} ]}
                for date_str, points in data_input.items():
                    dt_aware = pd.to_datetime(date_str)
                    if dt_aware.tzinfo is None:
                        dt_aware = dt_aware.tz_localize('UTC')
                    
                    for pt in points:
                        geom_wkt = f"POINT({pt['Longitude']} {pt['Latitude']})"
                        new_records.append(make_record(dt_aware, geom_wkt, pt))
                        
            elif isinstance(data_input, list):
                # Flat list format: [{"Date": "...", "Longitude": ..., ...}]
                for pt in data_input:
                    dt_aware = pd.to_datetime(pt['Date'])
                    if dt_aware.tzinfo is None:
                        dt_aware = dt_aware.tz_localize('UTC')
                        
                    geom_wkt = f"POINT({pt['Longitude']} {pt['Latitude']})"
                    new_records.append(make_record(dt_aware, geom_wkt, pt))
                    
        else:
            # Pandas parsing for tabular formats
            if filename.endswith(".csv"):
                df = pd.read_csv(io.BytesIO(contents))
            elif filename.endswith(".txt"):
                try:
                    df = pd.read_csv(io.BytesIO(contents), sep=None, engine='python')
                except:
                    df = pd.read_csv(io.BytesIO(contents))
            elif filename.endswith(".xlsx") or filename.endswith(".xls"):
                df = pd.read_excel(io.BytesIO(contents))
            else:
                raise ValueError("Unsupported file format. Please upload .csv, .txt, .xlsx, or .json")
            
            for _, row in df.iterrows():
                geom_wkt = f"POINT({row['Longitude']} {row['Latitude']})"
                
                dt_aware = pd.to_datetime(row['Date'])
                if dt_aware.tzinfo is None:
                    dt_aware = dt_aware.tz_localize('UTC')
                
                row_dict = row.to_dict()
                new_records.append(make_record(dt_aware, geom_wkt, row_dict))

        # Bulk insert the records
        if new_records:
            db.add_all(new_records)
            await db.commit()
            
        sat_label = "Sentinel-2" if is_s2 else "Sentinel-3"
        return {
            "status": "success",
            "message": f"Successfully ingested {len(new_records)} {sat_label} turbidity points.",
            "inserted_count": len(new_records)
        }
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to ingest data: {str(e)}"
        )

@router.get("/data")
async def get_turbidity_data(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    satellite: str = Query("S3", description="Satellite source: S2 or S3"),
    limit: int = 100,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin)
):
    """
    Retrieve paginated data for the Admin Dashboard table. 
    Can filter by date range. Routes to correct table based on satellite.
    """
    from sqlalchemy import select, func
    
    Model = TurbidityDataS2 if satellite == "S2" else TurbidityData
    
    # Build select columns dynamically
    if satellite == "S2":
        query = select(
            Model.id,
            Model.measurement_date,
            func.ST_X(Model.geom).label('longitude'),
            func.ST_Y(Model.geom).label('latitude'),
            Model.tur_eljaiek,
            Model.tur_dogliotti2015,
            Model.tur_nechad2009_665
        ).order_by(Model.measurement_date.desc())
    else:
        query = select(
            Model.id,
            Model.measurement_date,
            func.ST_X(Model.geom).label('longitude'),
            func.ST_Y(Model.geom).label('latitude'),
            Model.rrs_665,
            Model.tt_pred
        ).order_by(Model.measurement_date.desc())
    
    count_query = select(func.count(Model.id))

    if start_date:
        start_dt = pd.to_datetime(start_date)
        if start_dt.tzinfo is None:
            start_dt = start_dt.tz_localize('UTC')
        query = query.where(Model.measurement_date >= start_dt)
        count_query = count_query.where(Model.measurement_date >= start_dt)
    
    if end_date:
        end_dt = pd.to_datetime(end_date)
        if end_dt.tzinfo is None:
            end_dt = end_dt.tz_localize('UTC')
        end_dt = end_dt.replace(hour=23, minute=59, second=59)
        query = query.where(Model.measurement_date <= end_dt)
        count_query = count_query.where(Model.measurement_date <= end_dt)

    total_count = await db.scalar(count_query)

    query = query.limit(limit).offset(offset)
    result = await db.execute(query)
    rows = result.all()

    if satellite == "S2":
        data = [
            {
                "id": row.id,
                "date": row.measurement_date.isoformat(),
                "longitude": row.longitude,
                "latitude": row.latitude,
                "tur_eljaiek": row.tur_eljaiek,
                "tur_dogliotti2015": row.tur_dogliotti2015,
                "tur_nechad2009_665": row.tur_nechad2009_665
            }
            for row in rows
        ]
    else:
        data = [
            {
                "id": row.id,
                "date": row.measurement_date.isoformat(),
                "longitude": row.longitude,
                "latitude": row.latitude,
                "rrs_665": row.rrs_665,
                "tt_pred": row.tt_pred
            }
            for row in rows
        ]

    return {
        "data": data,
        "total": total_count,
        "page": (offset // limit) + 1,
        "limit": limit
    }

from pydantic import BaseModel
class DeleteDataRequest(BaseModel):
    password: str
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    satellite: str = "S3"

@router.delete("/data")
async def delete_turbidity_data(
    payload: DeleteDataRequest,
    db: AsyncSession = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin)
):
    """
    Deletes all records or filters by date range.
    Routes to correct table based on satellite. Requires password confirmation.
    """
    from sqlalchemy import delete
    
    if not verify_password(payload.password, current_admin.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password for database deletion"
        )

    Model = TurbidityDataS2 if payload.satellite == "S2" else TurbidityData
    stmt = delete(Model)
    
    if payload.start_date:
        start_dt = pd.to_datetime(payload.start_date)
        if start_dt.tzinfo is None:
            start_dt = start_dt.tz_localize('UTC')
        stmt = stmt.where(Model.measurement_date >= start_dt)
        
    if payload.end_date:
        end_dt = pd.to_datetime(payload.end_date)
        if end_dt.tzinfo is None:
            end_dt = end_dt.tz_localize('UTC')
        end_dt = end_dt.replace(hour=23, minute=59, second=59)
        stmt = stmt.where(Model.measurement_date <= end_dt)

    try:
        result = await db.execute(stmt)
        deleted_count = result.rowcount
        await db.commit()
        return {
            "status": "success",
            "message": f"Successfully deleted {deleted_count} points",
            "deleted_count": deleted_count
        }
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete data: {str(e)}"
        )

from fastapi.responses import StreamingResponse

@router.get("/download")
async def download_turbidity_data(
    format: str = "csv",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    satellite: str = Query("S3", description="Satellite source: S2 or S3"),
    db: AsyncSession = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin)
):
    """
    Export database records to CSV, JSON, TXT, or XLSX formats.
    Routes to correct table based on satellite.
    """
    from sqlalchemy import select, func
    
    Model = TurbidityDataS2 if satellite == "S2" else TurbidityData
    
    if satellite == "S2":
        query = select(
            Model.id,
            Model.measurement_date,
            func.ST_X(Model.geom).label('longitude'),
            func.ST_Y(Model.geom).label('latitude'),
            Model.tur_eljaiek,
            Model.tur_dogliotti2015,
            Model.tur_nechad2009_665
        ).order_by(Model.measurement_date.asc())
    else:
        query = select(
            Model.id,
            Model.measurement_date,
            func.ST_X(Model.geom).label('longitude'),
            func.ST_Y(Model.geom).label('latitude'),
            Model.rrs_665,
            Model.tt_pred
        ).order_by(Model.measurement_date.asc())
    
    if start_date:
        start_dt = pd.to_datetime(start_date)
        if start_dt.tzinfo is None:
            start_dt = start_dt.tz_localize('UTC')
        query = query.where(Model.measurement_date >= start_dt)
        
    if end_date:
        end_dt = pd.to_datetime(end_date)
        if end_dt.tzinfo is None:
            end_dt = end_dt.tz_localize('UTC')
        end_dt = end_dt.replace(hour=23, minute=59, second=59)
        query = query.where(Model.measurement_date <= end_dt)
        
    result = await db.execute(query)
    rows = result.all()
    
    if satellite == "S2":
        data_list = [
            {
                "Date": row.measurement_date.isoformat(),
                "Longitude": row.longitude,
                "Latitude": row.latitude,
                "TUR_Eljaiek": row.tur_eljaiek,
                "TUR_Dogliotti2015": row.tur_dogliotti2015,
                "TUR_Nechad2009_665": row.tur_nechad2009_665
            }
            for row in rows
        ]
    else:
        data_list = [
            {
                "Date": row.measurement_date.isoformat(),
                "Longitude": row.longitude,
                "Latitude": row.latitude,
                "Rrs_665": row.rrs_665,
                "TT_pred": row.tt_pred
            }
            for row in rows
        ]
    df = pd.DataFrame(data_list)
    
    sat_label = "sentinel2" if satellite == "S2" else "sentinel3"
    if format.lower() == "csv":
        stream = io.StringIO()
        df.to_csv(stream, index=False)
        content = stream.getvalue().encode('utf-8')
        media_type = "text/csv"
        filename = f"turbidity_{sat_label}.csv"
    elif format.lower() == "json":
        stream = io.StringIO()
        df.to_json(stream, orient="records", date_format="iso")
        content = stream.getvalue().encode('utf-8')
        media_type = "application/json"
        filename = f"turbidity_{sat_label}.json"
    elif format.lower() == "txt":
        stream = io.StringIO()
        df.to_csv(stream, index=False, sep='\t')
        content = stream.getvalue().encode('utf-8')
        media_type = "text/plain"
        filename = f"turbidity_{sat_label}.txt"
    elif format.lower() == "xlsx":
        stream = io.BytesIO()
        df.to_excel(stream, index=False)
        content = stream.getvalue()
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        filename = f"turbidity_{sat_label}.xlsx"
    else:
        raise HTTPException(status_code=400, detail="Invalid format. Use 'csv', 'json', 'txt', or 'xlsx'")
        
    return StreamingResponse(
        iter([content]),
        media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

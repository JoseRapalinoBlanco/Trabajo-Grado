from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Dict, Any, Optional
from database import get_db
from models import AdminUser, TurbidityData
from security import get_current_admin, verify_password
from datetime import datetime
import pandas as pd
import io
import json

router = APIRouter()

@router.post("/upload-data", status_code=status.HTTP_201_CREATED)
async def upload_turbidity_data(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin)
):
    """
    Ingests tabular or JSON data into the database.
    Supports .csv, .txt, .xlsx, and .json.
    """
    new_records = []
    
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
                        record = TurbidityData(
                            measurement_date=dt_aware,
                            geom=geom_wkt,
                            rrs_665=pt.get("Rrs_665"),
                            tt_pred=pt.get("TT_pred")
                        )
                        new_records.append(record)
                        
            elif isinstance(data_input, list):
                # Flat list format downloaded from app: [{"Date": "...", "Longitude": ..., ...}]
                for pt in data_input:
                    dt_aware = pd.to_datetime(pt['Date'])
                    if dt_aware.tzinfo is None:
                        dt_aware = dt_aware.tz_localize('UTC')
                        
                    geom_wkt = f"POINT({pt['Longitude']} {pt['Latitude']})"
                    record = TurbidityData(
                        measurement_date=dt_aware,
                        geom=geom_wkt,
                        rrs_665=pt.get("Rrs_665"),
                        tt_pred=pt.get("TT_pred")
                    )
                    new_records.append(record)
                    
        else:
            # Pandas parsing for tabular formats
            if filename.endswith(".csv"):
                df = pd.read_csv(io.BytesIO(contents))
            elif filename.endswith(".txt"):
                try:
                    # Try to parse with automatic delimiter detection (handles both \t and ,)
                    df = pd.read_csv(io.BytesIO(contents), sep=None, engine='python')
                except:
                    df = pd.read_csv(io.BytesIO(contents))
            elif filename.endswith(".xlsx") or filename.endswith(".xls"):
                df = pd.read_excel(io.BytesIO(contents))
            else:
                raise ValueError("Unsupported file format. Please upload .csv, .txt, .xlsx, or .json")
            
            # Ensure column names map exactly, pandas handles standard CSV/Excel well
            # Expected columns: Date, Longitude, Latitude, Rrs_665, TT_pred
            for _, row in df.iterrows():
                geom_wkt = f"POINT({row['Longitude']} {row['Latitude']})"
                
                dt_aware = pd.to_datetime(row['Date'])
                if dt_aware.tzinfo is None:
                    dt_aware = dt_aware.tz_localize('UTC')
                
                record = TurbidityData(
                    measurement_date=dt_aware,
                    geom=geom_wkt,
                    rrs_665=row.get('Rrs_665'),
                    tt_pred=row.get('TT_pred')
                )
                new_records.append(record)

        # Bulk insert the records
        if new_records:
            db.add_all(new_records)
            await db.commit()
            
        return {
            "status": "success",
            "message": f"Successfully ingested {len(new_records)} turbidity points.",
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
    limit: int = 100,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin)
):
    """
    Retrieve paginated data for the Admin Dashboard table. 
    Can filter by date range.
    """
    from sqlalchemy import select, func
    from sqlalchemy.dialects.postgresql import array
    
    # Base query
    query = select(
        TurbidityData.id,
        TurbidityData.measurement_date,
        func.ST_X(TurbidityData.geom).label('longitude'),
        func.ST_Y(TurbidityData.geom).label('latitude'),
        TurbidityData.rrs_665,
        TurbidityData.tt_pred
    ).order_by(TurbidityData.measurement_date.desc())
    
    # Count query for total pagination
    count_query = select(func.count(TurbidityData.id))

    # Apply date filters if available
    if start_date:
        start_dt = pd.to_datetime(start_date)
        if start_dt.tzinfo is None:
            start_dt = start_dt.tz_localize('UTC')
        query = query.where(TurbidityData.measurement_date >= start_dt)
        count_query = count_query.where(TurbidityData.measurement_date >= start_dt)
    
    if end_date:
        # Include the whole day if just a date string is provided by adding 23:59:59
        end_dt = pd.to_datetime(end_date)
        if end_dt.tzinfo is None:
            end_dt = end_dt.tz_localize('UTC')
        end_dt = end_dt.replace(hour=23, minute=59, second=59)
        query = query.where(TurbidityData.measurement_date <= end_dt)
        count_query = count_query.where(TurbidityData.measurement_date <= end_dt)

    total_count = await db.scalar(count_query)

    query = query.limit(limit).offset(offset)
    result = await db.execute(query)
    rows = result.all()

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

@router.delete("/data")
async def delete_turbidity_data(
    payload: DeleteDataRequest,
    db: AsyncSession = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin)
):
    """
    Deletes all records or filters by date range.
    Requires password confirmation.
    """
    from sqlalchemy import delete
    
    if not verify_password(payload.password, current_admin.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password for database deletion"
        )

    stmt = delete(TurbidityData)
    
    if payload.start_date:
        start_dt = pd.to_datetime(payload.start_date)
        if start_dt.tzinfo is None:
            start_dt = start_dt.tz_localize('UTC')
        stmt = stmt.where(TurbidityData.measurement_date >= start_dt)
        
    if payload.end_date:
        end_dt = pd.to_datetime(payload.end_date)
        if end_dt.tzinfo is None:
            end_dt = end_dt.tz_localize('UTC')
        end_dt = end_dt.replace(hour=23, minute=59, second=59)
        stmt = stmt.where(TurbidityData.measurement_date <= end_dt)

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
    db: AsyncSession = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin)
):
    """
    Export database records to CSV or JSON formats.
    """
    from sqlalchemy import select, func
    
    query = select(
        TurbidityData.id,
        TurbidityData.measurement_date,
        func.ST_X(TurbidityData.geom).label('longitude'),
        func.ST_Y(TurbidityData.geom).label('latitude'),
        TurbidityData.rrs_665,
        TurbidityData.tt_pred
    ).order_by(TurbidityData.measurement_date.asc())
    
    if start_date:
        start_dt = pd.to_datetime(start_date)
        if start_dt.tzinfo is None:
            start_dt = start_dt.tz_localize('UTC')
        query = query.where(TurbidityData.measurement_date >= start_dt)
        
    if end_date:
        end_dt = pd.to_datetime(end_date)
        if end_dt.tzinfo is None:
            end_dt = end_dt.tz_localize('UTC')
        end_dt = end_dt.replace(hour=23, minute=59, second=59)
        query = query.where(TurbidityData.measurement_date <= end_dt)
        
    result = await db.execute(query)
    rows = result.all()
    
    # Map to list of dicts for easily loading into pandas
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
    
    if format.lower() == "csv":
        stream = io.StringIO()
        df.to_csv(stream, index=False)
        content = stream.getvalue().encode('utf-8')
        media_type = "text/csv"
        filename = "turbidity_data.csv"
    elif format.lower() == "json":
        stream = io.StringIO()
        df.to_json(stream, orient="records", date_format="iso")
        content = stream.getvalue().encode('utf-8')
        media_type = "application/json"
        filename = "turbidity_data.json"
    elif format.lower() == "txt":
        stream = io.StringIO()
        df.to_csv(stream, index=False, sep='\t')
        content = stream.getvalue().encode('utf-8')
        media_type = "text/plain"
        filename = "turbidity_data.txt"
    elif format.lower() == "xlsx":
        stream = io.BytesIO()
        df.to_excel(stream, index=False)
        content = stream.getvalue()
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        filename = "turbidity_data.xlsx"
    else:
        raise HTTPException(status_code=400, detail="Invalid format. Use 'csv', 'json', 'txt', or 'xlsx'")
        
    return StreamingResponse(
        iter([content]),
        media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

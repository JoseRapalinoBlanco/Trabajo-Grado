from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from datetime import datetime
from database import get_db
from models import TurbidityData, TurbidityDataS2
from schemas import HeatmapResponse, HeatmapPoint, DatesResponse
from typing import Optional, List

router = APIRouter()

def get_model_and_column(satellite: str, algorithm: str = "SVR"):
    """Returns (ModelClass, turbidity_column) based on satellite and algorithm selection."""
    if satellite == "S2":
        Model = TurbidityDataS2
        algo_map = {
            "Eljaiek": TurbidityDataS2.tur_eljaiek,
            "Dogliotti2015": TurbidityDataS2.tur_dogliotti2015,
            "Nechad2009": TurbidityDataS2.tur_nechad2009_665,
        }
        col = algo_map.get(algorithm, TurbidityDataS2.tur_nechad2009_665)
        return Model, col
    else:
        return TurbidityData, TurbidityData.tt_pred

@router.get("/available-dates", response_model=DatesResponse)
async def get_available_dates(
    satellite: str = Query("S3", description="Satellite source: S2 or S3"),
    algorithm: str = Query("SVR", description="Algorithm to use"),
    db: AsyncSession = Depends(get_db)
):
    """
    Returns a list of unique days (YYYY-MM-DD) that have turbidity data records.
    """
    Model, turb_col = get_model_and_column(satellite, algorithm)
    stmt = (
        select(func.date(Model.measurement_date).label("day"))
        .where(turb_col.is_not(None))
        .group_by("day")
        .order_by("day")
    )
    result = await db.execute(stmt)
    days = result.scalars().all()
    # Format dates as YYYY-MM-DD strings
    return DatesResponse(dates=[d.strftime("%Y-%m-%d") for d in days])

@router.get("/heatmap", response_model=HeatmapResponse)
async def get_heatmap_data(
    start_date: str = Query(..., description="Start date for filter (ISO Format)"),
    end_date: str = Query(..., description="End date for filter (ISO Format)"),
    satellite: str = Query("S3", description="Satellite source: S2 or S3"),
    algorithm: str = Query("SVR", description="Algorithm to use"),
    db: AsyncSession = Depends(get_db)
):
    """
    Retrieves points bounded by a date range, extracting standard lon/lat coordinates 
    from PostGIS geom column to hydrate OpenLayers map heatmaps.
    """
    import pandas as pd
    Model, turb_col = get_model_and_column(satellite, algorithm)
    
    try:
        start_dt = pd.to_datetime(start_date)
        if start_dt.tzinfo is None:
            start_dt = start_dt.tz_localize('UTC')
            
        end_dt = pd.to_datetime(end_date)
        if end_dt.tzinfo is None:
            end_dt = end_dt.tz_localize('UTC')
        end_dt = end_dt.replace(hour=23, minute=59, second=59)

        # Use PostGIS functions to extract X (longitude) and Y (latitude)
        stmt = (
            select(
                func.ST_X(Model.geom).label("longitude"),
                func.ST_Y(Model.geom).label("latitude"),
                turb_col.label("turbidity_ntu"),
                Model.measurement_date.label("date")
            )
            .where(
                and_(
                    Model.measurement_date >= start_dt,
                    Model.measurement_date <= end_dt,
                    turb_col.is_not(None) # Only return parsed turbidity points
                )
            )
        )
        
        result = await db.execute(stmt)
        rows = result.fetchall()

        import math
        points = []
        for row in rows:
            v = row.turbidity_ntu
            if v is None or (isinstance(v, float) and (math.isnan(v) or math.isinf(v))):
                continue
            points.append(
                HeatmapPoint(
                    longitude=row.longitude,
                    latitude=row.latitude,
                    turbidity_ntu=v,
                    date=row.date
                )
            )

        return HeatmapResponse(
            data=points,
            count=len(points)
        )

    except Exception as e:
        print(f"[heatmap] Error: {e}")
        return HeatmapResponse(data=[], count=0)

# --- Performance-optimized heatmap endpoint ---
from fastapi.responses import JSONResponse
import time

# In-memory cache for heatmap data (satellite data is immutable)
_heatmap_cache: dict[str, dict] = {}
_CACHE_TTL = 3600  # 1 hour TTL

@router.get("/heatmap-fast")
async def get_heatmap_data_fast(
    start_date: str = Query(..., description="Start date (ISO)"),
    end_date: str = Query(..., description="End date (ISO)"),
    satellite: str = Query("S3", description="Satellite source: S2 or S3"),
    algorithm: str = Query("SVR", description="Algorithm to use"),
    db: AsyncSession = Depends(get_db)
):
    """
    High-performance heatmap endpoint. Returns compact flat arrays 
    { lons: [...], lats: [...], vals: [...] } for minimal JSON overhead.
    Includes in-memory caching for repeated queries.
    """
    import pandas as pd
    Model, turb_col = get_model_and_column(satellite, algorithm)
    
    cache_key = f"{satellite}_{algorithm}_{start_date}_{end_date}"
    
    # Check cache
    if cache_key in _heatmap_cache:
        cached = _heatmap_cache[cache_key]
        if time.time() - cached["ts"] < _CACHE_TTL:
            return JSONResponse(content=cached["data"])
    
    try:
        start_dt = pd.to_datetime(start_date)
        if start_dt.tzinfo is None:
            start_dt = start_dt.tz_localize('UTC')
            
        end_dt = pd.to_datetime(end_date)
        if end_dt.tzinfo is None:
            end_dt = end_dt.tz_localize('UTC')
        end_dt = end_dt.replace(hour=23, minute=59, second=59)

        # Only select what we need: lon, lat, turbidity value
        stmt = (
            select(
                func.ST_X(Model.geom).label("longitude"),
                func.ST_Y(Model.geom).label("latitude"),
                turb_col.label("turbidity_ntu"),
            )
            .where(
                and_(
                    Model.measurement_date >= start_dt,
                    Model.measurement_date <= end_dt,
                    turb_col.is_not(None)
                )
            )
        )
        
        result = await db.execute(stmt)
        rows = result.fetchall()

        # Build compact flat arrays — filter out NaN/Inf which are not valid JSON
        import math
        lons = []
        lats = []
        vals = []
        for row in rows:
            v = row.turbidity_ntu
            if v is None or (isinstance(v, float) and (math.isnan(v) or math.isinf(v))):
                continue
            lons.append(float(row.longitude))
            lats.append(float(row.latitude))
            vals.append(float(v))

        response_data = {"lons": lons, "lats": lats, "vals": vals, "count": len(lons)}
        
        # Cache the result
        _heatmap_cache[cache_key] = {"data": response_data, "ts": time.time()}
        
        return JSONResponse(content=response_data)

    except Exception as e:
        print(f"[heatmap-fast] Error: {e}")
        # Return empty data instead of 500 to avoid frontend crash
        return JSONResponse(content={"lons": [], "lats": [], "vals": [], "count": 0})

@router.get("/timeseries/point")
async def get_timeseries_point(
    lat: float = Query(..., description="Latitude of the point"),
    lon: float = Query(..., description="Longitude of the point"),
    start_date: str = Query(..., description="Start date (ISO)"),
    end_date: str = Query(..., description="End date (ISO)"),
    satellite: str = Query("S3", description="Satellite source: S2 or S3"),
    algorithm: str = Query("SVR", description="Algorithm used"),
    db: AsyncSession = Depends(get_db)
):
    """
    Extracts time series data for a specific point within a 500m radius.
    Groups by day and averages multiple entries if present.
    """
    import pandas as pd
    Model, turb_col = get_model_and_column(satellite, algorithm)
    try:
        start_dt = pd.to_datetime(start_date)
        if start_dt.tzinfo is None:
            start_dt = start_dt.tz_localize('UTC')
            
        end_dt = pd.to_datetime(end_date)
        if end_dt.tzinfo is None:
            end_dt = end_dt.tz_localize('UTC')
        end_dt = end_dt.replace(hour=23, minute=59, second=59)

        # ST_DistanceSphere calculates distance in meters. 500 meters radius.
        target_point = func.ST_SetSRID(func.ST_MakePoint(lon, lat), 4326)
        
        stmt = (
            select(
                func.date(Model.measurement_date).label("date"),
                func.avg(turb_col).label("ntu")
            )
            .where(
                and_(
                    Model.measurement_date >= start_dt,
                    Model.measurement_date <= end_dt,
                    turb_col.is_not(None),
                    func.ST_DistanceSphere(Model.geom, target_point) <= 500
                )
            )
            .group_by("date")
            .order_by("date")
        )
        
        result = await db.execute(stmt)
        rows = result.fetchall()
        
        # Format dates as YYYY-MM-DD, filter out NaN
        import math
        data = []
        for row in rows:
            if row.ntu is not None and not (isinstance(row.ntu, float) and math.isnan(row.ntu)):
                data.append({"date": row.date.strftime("%Y-%m-%d"), "ntu": round(row.ntu, 2)})
        
        return data

    except Exception as e:
        print(f"[timeseries/point] Error: {e}")
        return []

@router.get("/analytics/range-stats")
async def get_analytics_range_stats(
    start_date: str = Query(..., description="Start date (ISO)"),
    end_date: str = Query(..., description="End date (ISO)"),
    satellite: str = Query("S3", description="Satellite source: S2 or S3"),
    algorithm: str = Query("SVR", description="Algorithm to use"),
    db: AsyncSession = Depends(get_db)
):
    """
    Computes scientific-grade statistics for all turbidity data points within a date range.
    Includes Mean, Max, Min, 90th Percentile (P90), and Coefficient of Variation (CV).
    """
    import pandas as pd
    import numpy as np
    Model, turb_col = get_model_and_column(satellite, algorithm)
    
    try:
        start_dt = pd.to_datetime(start_date)
        if start_dt.tzinfo is None:
            start_dt = start_dt.tz_localize('UTC')
            
        end_dt = pd.to_datetime(end_date)
        if end_dt.tzinfo is None:
            end_dt = end_dt.tz_localize('UTC')
        end_dt = end_dt.replace(hour=23, minute=59, second=59)

        # Extract ntu and date to compute both global stats and daily timeseries
        stmt = select(
            func.date(Model.measurement_date).label("date"),
            turb_col.label("ntu")
        ).where(
            and_(
                Model.measurement_date >= start_dt,
                Model.measurement_date <= end_dt,
                turb_col.is_not(None)
            )
        )
        result = await db.execute(stmt)
        rows = result.fetchall()

        if not rows:
            return {"empty": True}

        # Load into Pandas DataFrame for ultra-fast aggregation
        df = pd.DataFrame([{"date": r.date, "ntu": r.ntu} for r in rows])
        # Filter out NaN/Inf values (PostgreSQL NaN floats pass SQL IS NOT NULL checks)
        df = df[df['ntu'].notna() & np.isfinite(df['ntu'])]
        if df.empty:
            return {"empty": True}
        arr = df['ntu'].values

        mean_val = np.mean(arr)
        max_val = np.max(arr)
        min_val = np.min(arr)
        p90 = np.percentile(arr, 90)
        std_val = np.std(arr)
        cv = (std_val / mean_val * 100) if mean_val > 0 else 0

        # Discretize for UI distribution chart
        low = np.sum(arr <= 4)
        med = np.sum((arr > 4) & (arr <= 10))
        high = np.sum(arr > 10)
        total = len(arr)

        # Compute Daily Timeseries Trend
        df['date'] = pd.to_datetime(df['date']).dt.strftime('%Y-%m-%d')
        
        # Extract temporal context context for Mín and Máx
        max_idx = df['ntu'].idxmax()
        min_idx = df['ntu'].idxmin()
        max_date = df.loc[max_idx, 'date']
        min_date = df.loc[min_idx, 'date']

        daily_means = df.groupby('date')['ntu'].mean().round(2).reset_index()
        timeseries = daily_means.to_dict(orient='records')

        # Generate Continuous Frequency Distribution for AreaChart (e.g. 20 intervals)
        counts, bin_edges = np.histogram(arr, bins=20)
        frequencies = []
        for i in range(len(counts)):
            frequencies.append({
                "ntu": round(float((bin_edges[i] + bin_edges[i+1]) / 2), 2),
                "count": int(counts[i])
            })

        return {
            "empty": False,
            "mean": float(mean_val),
            "max": float(max_val),
            "max_date": max_date,
            "min": float(min_val),
            "min_date": min_date,
            "p90": float(p90),
            "std": float(std_val),
            "cv": float(cv),
            "variance": float(np.var(arr)),
            "dist": {
                "low": float((low / total) * 100),
                "med": float((med / total) * 100),
                "high": float((high / total) * 100)
            },
            "frequencies": frequencies,
            "timeseries": timeseries,
            "total_points": total
        }

    except Exception as e:
        print(f"[range-stats] Error: {e}")
        return {"empty": True}

@router.get("/analytics/comparative-delta")
async def get_analytics_comparative_delta(
    date_a: str = Query(..., description="Base date (ISO format, typically older)"),
    date_b: str = Query(..., description="Contrast date (ISO format, typically newer)"),
    satellite: str = Query("S3", description="Satellite source: S2 or S3"),
    algorithm: str = Query("SVR", description="Algorithm to use"),
    db: AsyncSession = Depends(get_db)
):
    """
    Computes a spatial delta (Date B - Date A) indicating changes in turbidity per pixel.
    Positive values mean turbidity increased, negative means it decreased.
    """
    import pandas as pd
    Model, turb_col = get_model_and_column(satellite, algorithm)
    
    try:
        # Resolve Date A bounds
        dt_A = pd.to_datetime(date_a)
        if dt_A.tzinfo is None: dt_A = dt_A.tz_localize('UTC')
        start_A = dt_A.replace(hour=0, minute=0, second=0)
        end_A = dt_A.replace(hour=23, minute=59, second=59)

        # Resolve Date B bounds
        dt_B = pd.to_datetime(date_b)
        if dt_B.tzinfo is None: dt_B = dt_B.tz_localize('UTC')
        start_B = dt_B.replace(hour=0, minute=0, second=0)
        end_B = dt_B.replace(hour=23, minute=59, second=59)

        async def fetch_points(start_dt, end_dt):
            stmt = select(
                func.ST_X(Model.geom).label("lon"),
                func.ST_Y(Model.geom).label("lat"),
                turb_col.label("ntu")
            ).where(
                and_(
                    Model.measurement_date >= start_dt,
                    Model.measurement_date <= end_dt,
                    turb_col.is_not(None)
                )
            )
            res = await db.execute(stmt)
            return res.fetchall()

        # Fetch both asynchronously from DB could be done with asyncio.gather, but sequential is fine for now
        rows_A = await fetch_points(start_A, end_A)
        rows_B = await fetch_points(start_B, end_B)

        if not rows_A or not rows_B:
            return {"empty": True, "detail": "Missing data for one or both dates."}

        # Index Date A by (lat, lon) rounding to 4 decimals (approx 10 meters) to match spatial grids securely
        import math
        dict_A = {}
        for row in rows_A:
            v = row.ntu
            if v is None or (isinstance(v, float) and (math.isnan(v) or math.isinf(v))):
                continue
            dict_A[(round(row.lat, 4), round(row.lon, 4))] = v

        lats = []
        lons = []
        deltas = []

        for row_b in rows_B:
            val_B = row_b.ntu
            if val_B is None or (isinstance(val_B, float) and (math.isnan(val_B) or math.isinf(val_B))):
                continue
            key = (round(row_b.lat, 4), round(row_b.lon, 4))
            if key in dict_A:
                val_A = dict_A[key]
                lats.append(row_b.lat)
                lons.append(row_b.lon)
                deltas.append(val_B - val_A)

        return {
            "empty": len(deltas) == 0,
            "lats": lats,
            "lons": lons,
            "deltas": deltas,
            "count": len(deltas)
        }

    except Exception as e:
        print(f"[comparative-delta] Error: {e}")
        return {"empty": True, "detail": str(e)}

from fastapi.responses import StreamingResponse
import io

@router.get("/download")
async def download_turbidity_public(
    format: str = "csv",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    satellite: str = "S3",
    algorithm: str = "SVR",
    db: AsyncSession = Depends(get_db)
):
    import pandas as pd
    """
    Public Export to CSV, JSON, TXT, or XLSX formats.
    """
    Model, turb_col = get_model_and_column(satellite, algorithm)
    
    # Build select columns dynamically based on satellite
    if satellite == "S2":
        query = select(
            Model.measurement_date,
            func.ST_X(Model.geom).label('longitude'),
            func.ST_Y(Model.geom).label('latitude'),
            Model.tur_eljaiek,
            Model.tur_dogliotti2015,
            Model.tur_nechad2009_665
        ).order_by(Model.measurement_date.asc())
    else:
        query = select(
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


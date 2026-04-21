from pydantic import BaseModel, Field, EmailStr
from datetime import datetime
from typing import List, Optional

# --- Request Schemas ---

class TurbidityFeature(BaseModel):
    date: datetime = Field(..., description="Measurement date and time")
    latitude: float = Field(..., description="Latitude coordinate (WGS84)")
    longitude: float = Field(..., description="Longitude coordinate (WGS84)")
    reflectance_665: Optional[float] = Field(None, description="Reflectance at 665nm")
    turbidity_ntu: Optional[float] = Field(None, description="Predicted Turbidity in NTU")

class UploadDataRequest(BaseModel):
    features: List[TurbidityFeature]

# --- Response Schemas ---

class HeatmapPoint(BaseModel):
    latitude: float
    longitude: float
    turbidity_ntu: float
    date: datetime

class HeatmapResponse(BaseModel):
    data: List[HeatmapPoint]
    count: int

class DatesResponse(BaseModel):
    dates: List[str] = Field(..., description="List of unique dates with data (YYYY-MM-DD)")

# --- Auth Schemas ---

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class InviteRequest(BaseModel):
    email: EmailStr

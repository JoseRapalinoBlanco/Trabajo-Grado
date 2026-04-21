from fastapi import APIRouter
from .admin import router as admin_router
from .turbidity import router as turbidity_router
from .auth import router as auth_router

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(auth_router, prefix="/auth", tags=["Admin Authentication"])
api_router.include_router(admin_router, prefix="/admin", tags=["Admin Ingestion"])
api_router.include_router(turbidity_router, prefix="/turbidity", tags=["Turbidity Map Data"])

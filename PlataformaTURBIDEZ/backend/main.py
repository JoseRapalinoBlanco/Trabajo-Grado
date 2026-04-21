from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging
from database import engine, Base, AsyncSessionLocal
from api import api_router
from models import AdminUser, TurbidityData, TurbidityDataS2
from security import get_password_hash
from sqlalchemy.future import select

logger = logging.getLogger(__name__)

app = FastAPI(
    title="TurbidezApp API",
    description="API for TurbidezApp project",
    version="1.0.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Expand whitelist in prod
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Attach routers
app.include_router(api_router)

@app.on_event("startup")
async def startup_event():
    logger.info("Starting up Backend Engine and confirming tables...")
    # Initialize missing tables on startup if they don't exist
    async with engine.begin() as conn:
        # Note: In production you should rely on Alembic. For MVP, we auto-create.
        await conn.run_sync(Base.metadata.create_all)
    
    # Seed initial Admin user
    async with AsyncSessionLocal() as session:
        initial_email = "jrapalinob@unicartagena.edu.co"
        stmt = select(AdminUser).where(AdminUser.email == initial_email)
        result = await session.execute(stmt)
        if not result.scalars().first():
            from sqlalchemy.exc import IntegrityError
            try:
                logger.info("Seeding initial admin user...")
                new_admin = AdminUser(
                    email=initial_email,
                    hashed_password=get_password_hash("Jose.12345"),
                    is_active=True
                )
                session.add(new_admin)
                await session.commit()
                logger.info("Initial admin user seeded successfully.")
            except IntegrityError:
                await session.rollback()
                logger.info("Initial admin user already seeded.")

@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Shutting down Engine...")
    await engine.dispose()

@app.get("/api/v1/health")
async def health_check():
    return {"status": "ok", "message": "VisioAgua Backend is running"}

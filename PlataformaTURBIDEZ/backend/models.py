from sqlalchemy import Column, BigInteger, DateTime, Float, String, Boolean
from geoalchemy2 import Geometry
from database import Base

class AdminUser(Base):
    __tablename__ = "admin_users"

    id = Column(BigInteger, primary_key=True, index=True, autoincrement=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)

class TurbidityData(Base):
    __tablename__ = "turbidity_data"

    id = Column(BigInteger, primary_key=True, index=True, autoincrement=True)
    measurement_date = Column(DateTime(timezone=True), nullable=False, index=True)
    # 4326 is WGS84 (Standard GPS Coordinates)
    geom = Column(Geometry('POINT', srid=4326), nullable=False, index=True)
    rrs_665 = Column(Float, nullable=True)
    tt_pred = Column(Float, nullable=True)

class TurbidityDataS2(Base):
    __tablename__ = "turbidity_data_s2"

    id = Column(BigInteger, primary_key=True, index=True, autoincrement=True)
    measurement_date = Column(DateTime(timezone=True), nullable=False, index=True)
    geom = Column(Geometry('POINT', srid=4326), nullable=False, index=True)
    tur_eljaiek = Column(Float, nullable=True)
    tur_dogliotti2015 = Column(Float, nullable=True)
    tur_nechad2009_665 = Column(Float, nullable=True)

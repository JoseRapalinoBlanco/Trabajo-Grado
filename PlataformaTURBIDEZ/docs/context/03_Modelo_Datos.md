Modelo de Datos y Esquema SQL1. Formato de Ingesta (El JSON de Entrada)El administrador subirá archivos JSON con la siguiente estructura exacta. El backend debe iterar sobre las llaves (fechas) y procesar los arrays.{
    "2024-01-14": [
        {
            "Longitude": -75.54620361,
            "Latitude": 10.40576172,
            "Rrs_665": 0.004302116,
            "TT_pred": 3.289750701
        },
        {
            "Longitude": -75.54380035,
            "Latitude": 10.40522766,
            "Rrs_665": 0.004398373,
            "TT_pred": 3.392823084
        }
    ]
}
2. Esquema de Base de Datos (PostgreSQL + TimescaleDB + PostGIS)El agente de base de datos debe generar migraciones (ej. usando Alembic) para la siguiente estructura.Tabla Principal: turbidity_dataEsta tabla debe ser convertida en una hypertable de TimescaleDB particionada por measurement_date.ColumnaTipo de DatoDescripciónidBIGSERIALPrimary Key (opcional, Timescale prefiere tuplas compuestas)measurement_dateTIMESTAMPTZFecha de la medición (extraída de la llave del JSON). Debe ser el partition key de Timescale.geomGEOMETRY(Point, 4326)Coordenada del punto (Lon/Lat) en WGS84. Generado vía PostGIS ST_SetSRID(ST_MakePoint(Longitude, Latitude), 4326).rrs_665DOUBLE PRECISIONValor crudo de reflectancia de la banda roja.tt_predDOUBLE PRECISIONValor de turbidez precalculado por el modelo SVR.Índices Críticos RequeridosÍndice Espacial: CREATE INDEX geom_idx ON turbidity_data USING GIST (geom);Índice Temporal: Generado automáticamente por TimescaleDB sobre measurement_date.3. Lógica de Transformación (Backend a BD)Al recibir el JSON, el Backend debe convertir masivamente los datos a registros SQL, asegurando que si una fecha ya existe en la base de datos, se reemplace o ignore (Upsert) para evitar duplicados.

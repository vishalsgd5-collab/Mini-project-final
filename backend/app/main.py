from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import Base, SessionLocal, engine
from .ml.fatigue_model import load_model
from .routers import auth, dashboard, fatigue, interventions
from .seed import seed_demo


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Base.metadata.create_all(bind=engine)
    load_model()
    db = SessionLocal()
    try:
        seed_demo(db)
    finally:
        db.close()
    yield


app = FastAPI(
    title="AURA — Fatigue Detection & Wellness Care",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(fatigue.router)
app.include_router(dashboard.router)
app.include_router(interventions.router)


@app.get("/api/health")
def health():
    return {"ok": True, "service": "aura"}

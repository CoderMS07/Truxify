from fastapi import APIRouter
from typing import List
from pydantic import BaseModel

router = APIRouter(prefix="/ml", tags=["ML"])

class DemandZone(BaseModel):
    lat: float
    lng: float
    intensity: float  # 0.0 (low) to 1.0 (high)
    label: str

class DemandHeatmapResponse(BaseModel):
    zones: List[DemandZone]
    forecast_hours: int

@router.get("/demand-heatmap", response_model=DemandHeatmapResponse)
async def get_demand_heatmap(hours: int = 48):
    """
    Returns mock demand heatmap data for the next N hours.
    TODO: Replace with real ML model inference (Model #9).
    """
    mock_zones = [
        {"lat": 19.0760, "lng": 72.8777, "intensity": 0.9, "label": "Mumbai"},
        {"lat": 28.6139, "lng": 77.2090, "intensity": 0.8, "label": "Delhi"},
        {"lat": 12.9716, "lng": 77.5946, "intensity": 0.7, "label": "Bengaluru"},
        {"lat": 17.3850, "lng": 78.4867, "intensity": 0.6, "label": "Hyderabad"},
        {"lat": 22.5726, "lng": 88.3639, "intensity": 0.5, "label": "Kolkata"},
        {"lat": 13.0827, "lng": 80.2707, "intensity": 0.75, "label": "Chennai"},
        {"lat": 23.0225, "lng": 72.5714, "intensity": 0.4, "label": "Ahmedabad"},
    ]
    return {"zones": mock_zones, "forecast_hours": hours}
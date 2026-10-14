from fastapi import APIRouter, Depends

from ..auth import get_current_user
from ..ml.interventions_catalog import CATALOG
from ..models import User

router = APIRouter(prefix="/api/interventions", tags=["interventions"])


@router.get("/catalog")
def catalog(user: User = Depends(get_current_user)):
    return {"items": CATALOG}

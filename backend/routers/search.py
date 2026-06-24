from fastapi import APIRouter, Depends, HTTPException, Query, status

from models import User
from schemas import SearchResponse
from services.search_service import search_and_summarize
from services.session_service import get_current_user

search_router = APIRouter(prefix="/search", tags=["search"])


@search_router.get("", response_model=SearchResponse)
def search(
    query: str = Query(min_length=1, max_length=500),
    _: User = Depends(get_current_user),
) -> SearchResponse:
    normalized_query = query.strip()
    if not normalized_query:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="query must not be blank",
        )
    answer, results = search_and_summarize(normalized_query)
    return SearchResponse(
        query=normalized_query,
        answer=answer,
        results=results,
    )

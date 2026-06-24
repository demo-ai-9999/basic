from fastapi import HTTPException

from services import search_service
from services.search_service import search_and_summarize


class FakeSegment:
    def __init__(self, text: str):
        self.text = text


class FakeSupport:
    def __init__(self, chunk_indices: list[int], text: str):
        self.grounding_chunk_indices = chunk_indices
        self.segment = FakeSegment(text)


class FakeWeb:
    def __init__(self, title: str, uri: str):
        self.title = title
        self.uri = uri


class FakeChunk:
    def __init__(self, title: str, uri: str):
        self.web = FakeWeb(title, uri)


class FakeMetadata:
    def __init__(self, chunks: list[FakeChunk], supports: list[FakeSupport]):
        self.grounding_chunks = chunks
        self.grounding_supports = supports


class FakeCandidate:
    def __init__(self, metadata: FakeMetadata):
        self.grounding_metadata = metadata


class FakeResponse:
    def __init__(self, text: str, metadata: FakeMetadata):
        self.text = text
        self.candidates = [FakeCandidate(metadata)]


def test_search_and_summarize_uses_grounding_results(monkeypatch):
    response = FakeResponse(
        text="FastAPI는 빠른 웹 프레임워크입니다.",
        metadata=FakeMetadata(
            chunks=[
                FakeChunk("FastAPI", "https://fastapi.tiangolo.com/"),
                FakeChunk("Python", "https://www.python.org/"),
            ],
            supports=[
                FakeSupport([0], "FastAPI는 빠른 웹 프레임워크입니다."),
                FakeSupport([1], "Python은 널리 쓰이는 언어입니다."),
            ],
        ),
    )

    monkeypatch.setattr(search_service, "_call_gemini_with_grounding", lambda query: response)

    answer, results = search_and_summarize("FastAPI")

    assert answer == "FastAPI는 빠른 웹 프레임워크입니다."
    assert [result.title for result in results] == ["FastAPI", "Python"]
    assert results[0].link == "https://fastapi.tiangolo.com/"
    assert results[0].snippet == "FastAPI는 빠른 웹 프레임워크입니다."
    assert results[1].snippet == "Python은 널리 쓰이는 언어입니다."


def test_search_and_summarize_falls_back_to_hostname_when_title_missing(monkeypatch):
    response = FakeResponse(
        text="검색 답변",
        metadata=FakeMetadata(
            chunks=[FakeChunk("", "https://example.com/articles/1")],
            supports=[],
        ),
    )

    monkeypatch.setattr(search_service, "_call_gemini_with_grounding", lambda query: response)

    _, results = search_and_summarize("검색")

    assert results[0].title == "example.com"
    assert results[0].snippet == ""


def test_search_and_summarize_raises_when_gemini_returns_empty_text(monkeypatch):
    response = FakeResponse(
        text="",
        metadata=FakeMetadata(chunks=[], supports=[]),
    )
    monkeypatch.setattr(search_service, "_call_gemini_with_grounding", lambda query: response)

    try:
        search_and_summarize("검색")
    except HTTPException as exc:
        assert exc.status_code == 502
        assert "빈 응답" in exc.detail
    else:
        raise AssertionError("HTTPException was not raised")


def test_get_grounding_client_requires_agentplatform_api_key(monkeypatch):
    monkeypatch.setattr(
        search_service,
        "get_settings",
        lambda: {"google_agentplatform_api_key": None},
    )

    try:
        search_service._get_grounding_client()
    except HTTPException as exc:
        assert exc.status_code == 500
        assert "GOOGLE_AGENTPLATFORM_API_KEY" in exc.detail
    else:
        raise AssertionError("HTTPException was not raised")

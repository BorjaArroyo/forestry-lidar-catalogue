FROM docker.io/library/python@sha256:081075da77b2b55c23c088251026fb69a7b2bf92471e491ff5fd75c192fd38e5
WORKDIR /pipeline
COPY entrypoint.py test_pipeline.py pipeline.json ANALYSIS.md README.md package-lock.json Dockerfile ./
ENV PYTHONDONTWRITEBYTECODE=1
ENTRYPOINT ["python", "entrypoint.py"]

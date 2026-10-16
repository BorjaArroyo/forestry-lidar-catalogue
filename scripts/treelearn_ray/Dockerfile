FROM nvidia/cuda:11.8.0-cudnn8-runtime-ubuntu22.04@sha256:85fb7ac694079fff1061a0140fd5b5a641997880e12112d92589c3bbb1e8b7ca
LABEL org.opencontainers.image.source="https://github.com/ecker-lab/TreeLearn" \
      org.opencontainers.image.revision="fd240ce7caa4c444fe3418aca454dc578bc557d4"
ENV DEBIAN_FRONTEND=noninteractive PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONUNBUFFERED=1 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.10 python3-pip python-is-python3 libgl1 libgomp1 libx11-6 wget ca-certificates \
    && dpkg-query -W > /opt/os-packages.txt \
    && rm -rf /var/lib/apt/lists/*
RUN python -m pip install --no-cache-dir pip==25.0.1 setuptools==75.8.2 wheel==0.45.1
RUN python -m pip install --no-cache-dir torch==2.0.0+cu118 torchvision==0.15.1+cu118 \
    --index-url https://download.pytorch.org/whl/cu118
COPY requirements.txt /opt/requirements.txt
RUN python -m pip install --no-cache-dir -r /opt/requirements.txt
COPY TreeLearn /opt/TreeLearn
ENV PYTHONPATH=/opt/TreeLearn
WORKDIR /opt/TreeLearn
RUN python -m pip install --no-cache-dir --no-deps . \
    && python -m pip check \
    && python -m pip freeze --all > /opt/python-packages.txt \
    && cd /tmp && python -c "import ray, torch, spconv.pytorch; from tree_learn.model.tree_learn import TreeLearn; from tree_learn.util import evaluate_instance_segmentation; assert torch.version.cuda == '11.8'; print(ray.__version__, torch.__version__)"
COPY driver.py partition_policy.py inference_check.py full_forest.py checkpoint-lock.json /opt/canopy/
RUN useradd --create-home --uid 1000 ray && mkdir -p /home/ray/.cache && chown -R ray:ray /home/ray
ENV HOME=/home/ray
USER ray
WORKDIR /home/ray
ENTRYPOINT []
CMD ["python", "/opt/canopy/driver.py", "--help"]

ENV PYTHONPATH=/opt/TreeLearn:/opt/canopy

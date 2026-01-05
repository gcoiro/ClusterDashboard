FROM python:3.11-slim

WORKDIR /app

# Install oc CLI
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates tar && \
    curl -L -o /tmp/oc.tar.gz https://mirror.openshift.com/pub/openshift-v4/clients/ocp/latest/openshift-client-linux.tar.gz && \
    tar -C /usr/local/bin -xzf /tmp/oc.tar.gz oc kubectl && \
    rm -rf /var/lib/apt/lists/* /tmp/oc.tar.gz

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose port
EXPOSE 9150

# Run the application
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "9150"]

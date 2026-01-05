FROM nginx:alpine

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy static files
COPY index.html /usr/share/nginx/html/
COPY styles.css /usr/share/nginx/html/
COPY app.js /usr/share/nginx/html/

# Expose port
EXPOSE 8080

# Start nginx (write pid under /tmp for non-root environments)
CMD ["nginx", "-g", "pid /tmp/nginx.pid; daemon off;"]


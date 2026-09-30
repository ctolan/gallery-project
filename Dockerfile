# Build stage
FROM node:20-alpine as build
WORKDIR /app
ARG VITE_FIREBASE_API_KEY=""
ARG VITE_FIREBASE_AUTH_DOMAIN=""
ARG VITE_FIREBASE_PROJECT_ID=""
ARG VITE_FIREBASE_APP_ID=""
ARG VITE_ARTWORK_API_URL=""
ARG VITE_ARTWORK_UPLOAD_ENABLED="false"
ENV VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY \
    VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN \
    VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID \
    VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID \
    VITE_ARTWORK_API_URL=$VITE_ARTWORK_API_URL \
    VITE_ARTWORK_UPLOAD_ENABLED=$VITE_ARTWORK_UPLOAD_ENABLED
# Add non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
COPY package*.json ./
# Install dependencies with exact versions
RUN npm ci
COPY . .
RUN npm run build && \
    # Clean up unnecessary files
    rm -rf node_modules

# Production stage
FROM nginx:alpine
# Add non-root user
RUN addgroup -S nginxgroup && adduser -S nginxuser -G nginxgroup
# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
# Set proper permissions
RUN chown -R nginxuser:nginxgroup /usr/share/nginx/html && \
    chmod -R 755 /usr/share/nginx/html && \
    chown -R nginxuser:nginxgroup /var/cache/nginx && \
    chown -R nginxuser:nginxgroup /var/log/nginx && \
    chown -R nginxuser:nginxgroup /etc/nginx/conf.d && \
    touch /var/run/nginx.pid && \
    chown -R nginxuser:nginxgroup /var/run/nginx.pid
USER nginxuser
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
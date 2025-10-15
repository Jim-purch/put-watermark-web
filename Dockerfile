# Multi-stage build: build static files with Node, serve via Nginx
FROM node:20-alpine AS build
WORKDIR /app

# Install deps first for better caching
COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps

# Copy source and build
COPY . .
RUN npm run build

FROM nginx:alpine AS runtime
WORKDIR /usr/share/nginx/html
COPY --from=build /app/dist .

# Optional: custom nginx config (using default is fine for static)
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
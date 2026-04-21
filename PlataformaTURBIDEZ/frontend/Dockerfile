FROM node:20-slim

WORKDIR /app

# Install dependencies first for caching
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Expose Vite dev port
EXPOSE 5173

# Run with --host to allow access from outside the container
CMD ["npm", "run", "dev", "--", "--host"]

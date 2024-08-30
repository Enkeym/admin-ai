# Stage 1: Build the application
FROM node:16-alpine AS builder

WORKDIR /index

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy the rest of the application code
COPY . .

# Stage 2: Create a lean production image
FROM node:16-alpine

WORKDIR /index

# Copy only the production dependencies and application code from the builder stage
COPY --from=builder /index /index

# Use a non-root user for security
USER node

# Expose the application port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]

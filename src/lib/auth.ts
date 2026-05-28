const API_SECRET_KEY = process.env.API_SECRET_KEY || "";

if (!API_SECRET_KEY) {
  console.warn("[AUTH] Warning: API_SECRET_KEY is not set. All endpoints are unprotected.");
}

export function validateApiKey(request: Request): boolean {
  if (!API_SECRET_KEY) {
    return true;
  }

  const authHeader = request.headers.get("authorization");
  const apiKey = request.headers.get("x-api-key");

  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    if (token === API_SECRET_KEY) {
      return true;
    }
  }

  if (apiKey === API_SECRET_KEY) {
    return true;
  }

  return false;
}

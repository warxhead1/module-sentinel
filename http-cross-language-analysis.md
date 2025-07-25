# HTTP/REST Cross-Language Communication Analysis

## Overview

This analysis examines REST API and HTTP cross-language communication patterns in the microservices demo, identifying what our parsers currently detect versus what they miss.

## Key Findings

### 1. **Frontend HTTP Endpoints (Go)**

The frontend service exposes multiple HTTP endpoints using Go's `mux` router:

```go
// Frontend endpoints from main.go
r.HandleFunc(baseUrl + "/", svc.homeHandler)
r.HandleFunc(baseUrl + "/product/{id}", svc.productHandler)
r.HandleFunc(baseUrl + "/cart", svc.viewCartHandler)
r.HandleFunc(baseUrl + "/cart", svc.addToCartHandler)
r.HandleFunc(baseUrl + "/cart/empty", svc.emptyCartHandler)
r.HandleFunc(baseUrl + "/setCurrency", svc.setCurrencyHandler)
r.HandleFunc(baseUrl + "/cart/checkout", svc.placeOrderHandler)
r.HandleFunc(baseUrl + "/assistant", svc.assistantHandler)
r.HandleFunc(baseUrl + "/bot", svc.chatBotHandler)
r.HandleFunc(baseUrl + "/_healthz", ...)
r.HandleFunc(baseUrl + "/product-meta/{ids}", svc.getProductByID)
```

**Status**: ❌ These HTTP route definitions are NOT creating relationships to their consumers

### 2. **Loadgenerator HTTP Client Calls (Python)**

The loadgenerator makes HTTP calls to the frontend using Python's Locust framework:

```python
# Loadgenerator HTTP calls from locustfile.py
l.client.get("/")
l.client.post("/setCurrency", {'currency_code': ...})
l.client.get("/product/" + product_id)
l.client.get("/cart")
l.client.post("/cart", {'product_id': ...})
l.client.post('/cart/empty')
l.client.post("/cart/checkout", {...})
l.client.get('/logout')
```

**Status**: ❌ These HTTP client calls are NOT creating cross-language relationships to the Go frontend

### 3. **JavaScript Fetch Calls in Templates**

The frontend's assistant.html template makes client-side HTTP calls:

```javascript
// Frontend template JavaScript
const response = await fetch("{{ $.baseUrl }}/bot", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ message: message, image: image })
});

const productResponse = await fetch("{{ $.baseUrl }}/product-meta/" + id, {
  method: "GET",
  headers: { "Content-Type": "application/json" }
});
```

**Status**: ❌ JavaScript fetch() calls in HTML templates are NOT detected at all

### 4. **Service Discovery via Environment Variables**

Services use environment variables for service addresses:

```go
// From checkoutservice/main.go
mustMapEnv(&svc.shippingSvcAddr, "SHIPPING_SERVICE_ADDR")
mustMapEnv(&svc.productCatalogSvcAddr, "PRODUCT_CATALOG_SERVICE_ADDR")
mustMapEnv(&svc.cartSvcAddr, "CART_SERVICE_ADDR")
mustMapEnv(&svc.currencySvcAddr, "CURRENCY_SERVICE_ADDR")
mustMapEnv(&svc.emailSvcAddr, "EMAIL_SERVICE_ADDR")
mustMapEnv(&svc.paymentSvcAddr, "PAYMENT_SERVICE_ADDR")

// From frontend/main.go
mustMapEnv(&svc.productCatalogSvcAddr, "PRODUCT_CATALOG_SERVICE_ADDR")
mustMapEnv(&svc.currencySvcAddr, "CURRENCY_SERVICE_ADDR")
mustMapEnv(&svc.cartSvcAddr, "CART_SERVICE_ADDR")
mustMapEnv(&svc.recommendationSvcAddr, "RECOMMENDATION_SERVICE_ADDR")
mustMapEnv(&svc.checkoutSvcAddr, "CHECKOUT_SERVICE_ADDR")
mustMapEnv(&svc.shippingSvcAddr, "SHIPPING_SERVICE_ADDR")
mustMapEnv(&svc.adSvcAddr, "AD_SERVICE_ADDR")
```

**Status**: ❌ Service discovery patterns are NOT used to infer relationships

### 5. **Mixed Protocol Usage**

The microservices demo uses:
- **HTTP**: Frontend web interface, loadgenerator → frontend
- **gRPC**: Inter-service communication (frontend → backend services)
- **WebSocket**: Not used in this demo

## What Our Parsers Are Missing

### 1. **HTTP Route Registration Patterns**

Our parsers need to detect and create relationships for:
- Go: `HandleFunc("/path", handler)` → creates HTTP endpoint
- Python Flask: `@app.route("/path")` → creates HTTP endpoint
- Express.js: `app.get("/path", handler)` → creates HTTP endpoint
- Spring: `@GetMapping("/path")` → creates HTTP endpoint

### 2. **HTTP Client Call Patterns**

Our parsers need to detect and create relationships for:
- Python: `client.get("/path")`, `requests.get(url)`
- JavaScript: `fetch("/path")`, `axios.get("/path")`
- Go: `http.Get(url)`, `client.Get("/path")`
- Java: `httpClient.send(request)`

### 3. **Service URL Construction**

Our parsers should track:
- Environment variable usage: `CART_SERVICE_ADDR` → implies HTTP/gRPC connection to cart service
- URL construction: `baseUrl + "/cart"` → endpoint path
- Host/port combinations: `localhost:8080` → service endpoint

### 4. **Template-Based JavaScript**

Our parsers completely miss:
- JavaScript code in HTML templates
- Dynamic URL construction in templates: `{{ $.baseUrl }}/bot`
- Client-side fetch() calls that create HTTP relationships

## Specific Examples of Missing Relationships

### Example 1: Loadgenerator → Frontend
```
Source: loadgenerator/locustfile.py:35 (Python)
  l.client.get("/")
Target: frontend/main.go:149 (Go)
  r.HandleFunc(baseUrl + "/", svc.homeHandler)
Relationship: HTTP GET call (cross-language: Python → Go)
```

### Example 2: Frontend JavaScript → Frontend Go
```
Source: frontend/templates/assistant.html:134 (JavaScript)
  fetch("{{ $.baseUrl }}/bot", { method: "POST" })
Target: frontend/main.go:162 (Go)
  r.HandleFunc(baseUrl + "/bot", svc.chatBotHandler)
Relationship: HTTP POST call (cross-language: JavaScript → Go)
```

### Example 3: Service Discovery
```
Source: frontend/main.go:131
  mustMapEnv(&svc.productCatalogSvcAddr, "PRODUCT_CATALOG_SERVICE_ADDR")
Target: productcatalogservice (inferred)
Relationship: Service dependency (configured via environment)
```

## Recommendations for Parser Improvements

1. **Enhanced REST API Detection in CrossLanguageDetector**
   - Add pattern matching for route registration (HandleFunc, @app.route, etc.)
   - Match HTTP client calls with registered routes
   - Track base URL and path construction

2. **Template JavaScript Parsing**
   - Parse JavaScript within HTML templates
   - Extract fetch() and XMLHttpRequest calls
   - Resolve template variables ({{ $.baseUrl }})

3. **Service Discovery Integration**
   - Track environment variable definitions for service addresses
   - Create inferred relationships based on SERVICE_ADDR patterns
   - Link service names to actual service implementations

4. **HTTP Method Matching**
   - Match HTTP methods (GET, POST, etc.) between clients and servers
   - Use path patterns to link calls to handlers
   - Consider URL parameters and wildcards (/product/{id})

5. **Cross-File URL Resolution**
   - Track base URL definitions
   - Resolve relative URLs to absolute endpoints
   - Link URL construction to actual usage

## Impact

Currently, we're missing critical HTTP-based cross-language relationships:
- **Loadgenerator → Frontend**: All HTTP test traffic
- **Frontend Templates → Frontend API**: Client-side JavaScript calls
- **Service Discovery**: Environment-based service connections

These missing relationships mean our dependency graph is incomplete for:
- Understanding API usage patterns
- Tracking cross-service dependencies
- Analyzing the full impact of API changes
- Identifying unused endpoints
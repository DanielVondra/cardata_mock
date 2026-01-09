API Endpoints:

GET /api/v1/road-safety/hotspots bbox (povinný): Geografický ohraničující box ve
formátu {min_lon},{min_lat},{max_lon},{max_lat}. min_confidence (volitelný):
Celé číslo (0-100). Vrátí pouze hotspoty s metadata.risk.confidence rovným nebo
vyšším než zadaná hodnota. Výchozí hodnota je 0. type (volitelný): Řetězec
oddělený čárkami. Vrátí pouze hotspoty se zadanými typy rizik (např.
type=VA,EB). Pokud není specifikováno, vrací všechny typy.

GET /api/v1/road-safety/history/{YYYY-MM-DD} {YYYY-MM-DD} (povinný): Datum ve
formátu ISO 8601.

GET /api/v1/weather/cells bbox (volitelný): Geografický ohraničující box ve
formátu {min_lon},{min_lat},{max_lon},{max_lat}. Vrátí všechny H3 buňky, jejichž
střed se nachází uvnitř tohoto boxu. h3_indexes (volitelný): Řetězec H3 indexů
oddělených čárkami. Vrátí data pro specifikované buňky.

GET /api/v1/weather/history/{YYYY-MM-DD} {YYYY-MM-DD} (povinný): Datum ve
formátu ISO 8601. bbox (volitelný): Geografický ohraničující box pro omezení
výsledků. h3_indexes (volitelný): Seznam H3 indexů pro omezení výsledků.

GET
/api/v1/road-safety/hotspots?bbox=14.0,49.9,14.8,50.2&min_confidence=70&type=VA
GET /api/v1/weather/cells?bbox=14.0,49.9,14.8,50.2 GET
/api/v1/weather/cells?h3_indexes=8928308280fffff,8928308287fffff

weather:

{ "location": { "h3_index": "8928308280fffff" }, "timeframe": { "last":
"2023-10-27T14:45:10Z" }, "metadata": { "confidence": 88, "total_count": 54 },
"environment": { "temperature": 12.5, "is_night": false, "conditions": {
"rain_intensity": "LOW", "road_condition": "WET", "fog": false, "cross_wind":
true } }, "statistics": { "temperature": { "lowest": { "value": -15.2,
"timestamp": "2023-01-20T04:30:00Z" }, "highest": { "value": 34.8, "timestamp":
"2023-07-15T15:00:00Z" } }, "day_counts": { "rain": { "low": 45, "medium": 20,
"high": 5 }, "slippery_road": 32, "fog": 18, "cross_wind": 55 } } }

road safety:

{ "location": { "latitude": 49.820923, "longitude": 18.262524, "std_dev": 25.5
}, "metadata": { "risk": { "type": "VA", "importance": 5, "confidence": 92,
"residual_confidence": 78 }, "total_count": 150, "weather_impact": 4,
"time_of_day_impact": 3 }, "timeframe": { "first": "2023-01-10T08:00:00Z",
"last": "2023-12-05T17:30:00Z" }, "vehicle": { "heading": { "avg": 270.5,
"std_dev": 8.2 } }, "environment": { "air_temperature": { "avg": 8.5, "std_dev":
4.1 }, "sun_position": { "avg": 35.2, "std_dev": 10.5 }, "conditions": {
"dry_road": { "is_present": true, "count": 100 }, "wet_road": { "is_present":
true, "count": 50 }, "rain": { "is_present": true, "count": 40 },
"slippery_road": { "is_present": false, "count": 10 }, "fog": { "is_present":
false, "count": 5 }, "crosswind": { "is_present": true, "count": 20 } } },
"statistics": { "distribution": { "by_week": { "1": 10, "2": 15, "48": 12, "49":
8 }, "by_day": { "Mo": 25, "Tu": 20, "We": 30, "Th": 22, "Fr": 35, "Sa": 10,
"Su": 8 }, "by_time": { "07:30": 25, "08:00": 30, "16:00": 20, "16:30": 28 } } }
}

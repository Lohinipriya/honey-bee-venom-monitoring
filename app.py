
from flask import Flask, jsonify, request, send_from_directory
import sqlite3
import os

app = Flask(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE = os.path.join(BASE_DIR, "honeybee.db")


def get_db_connection():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn


def add_column_if_missing(conn, table, column, definition):
    columns = [
        row["name"]
        for row in conn.execute(f"PRAGMA table_info({table})").fetchall()
    ]

    if column not in columns:
        conn.execute(
            f"ALTER TABLE {table} ADD COLUMN {column} {definition}"
        )


def create_tables():
    conn = get_db_connection()

    conn.execute("""
        CREATE TABLE IF NOT EXISTS hives (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hive_name TEXT NOT NULL,
            location TEXT,
            status TEXT
        )
    """)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS sensorReadings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hive_id INTEGER,
            temperature REAL,
            humidity REAL,
            recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS venomRecords (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hive_id INTEGER,
            quantity REAL,
            collection_date TEXT
        )
    """)

    add_column_if_missing(conn, "hives", "hive_code", "TEXT")
    add_column_if_missing(conn, "hives", "bee_type", "TEXT")

    add_column_if_missing(conn, "venomRecords", "collection_code", "TEXT")
    add_column_if_missing(conn, "venomRecords", "hive_code", "TEXT")
    add_column_if_missing(conn, "venomRecords", "method", "TEXT")

    conn.execute("""
        UPDATE hives
        SET hive_code = hive_name
        WHERE hive_code IS NULL OR hive_code = ''
    """)

    conn.commit()
    conn.close()


@app.route("/")
def home():
    return send_from_directory(BASE_DIR, "index.html")


@app.route("/style.css")
def css_file():
    return send_from_directory(BASE_DIR, "style.css")


@app.route("/script.js")
def javascript_file():
    return send_from_directory(BASE_DIR, "script.js")


@app.route("/test-db")
def test_db():
    conn = get_db_connection()

    tables = conn.execute("""
        SELECT name FROM sqlite_master
        WHERE type = 'table'
    """).fetchall()

    conn.close()

    return jsonify({
        "status": "success",
        "database": "honeybee.db",
        "tables": [row["name"] for row in tables]
    })


# HIVE API
@app.route("/api/hives", methods=["GET", "POST"])
def hives_api():
    conn = get_db_connection()

    if request.method == "POST":
        data = request.get_json(silent=True) or {}

        hive_code = str(data.get("hiveId", "")).strip()
        location = str(data.get("location", "")).strip()
        bee_type = str(data.get("beeType", "")).strip()
        status = str(data.get("status", "")).strip()

        if not all([hive_code, location, bee_type, status]):
            conn.close()
            return jsonify({"error": "Please fill all hive fields"}), 400

        duplicate = conn.execute(
            "SELECT id FROM hives WHERE hive_code = ?",
            (hive_code,)
        ).fetchone()

        if duplicate:
            conn.close()
            return jsonify({"error": "Hive ID already exists"}), 409

        conn.execute("""
            INSERT INTO hives
            (hive_name, location, status, hive_code, bee_type)
            VALUES (?, ?, ?, ?, ?)
        """, (hive_code, location, status, hive_code, bee_type))

        conn.commit()
        conn.close()

        return jsonify({"message": "Hive saved successfully"}), 201

    rows = conn.execute("""
        SELECT hive_code, location, bee_type, status
        FROM hives
        ORDER BY id DESC
    """).fetchall()

    conn.close()
    return jsonify([dict(row) for row in rows])


# VENOM COLLECTION API
@app.route("/api/venom-records", methods=["GET", "POST"])
def venom_api():
    conn = get_db_connection()

    if request.method == "POST":
        data = request.get_json(silent=True) or {}

        collection_code = str(data.get("collectionId", "")).strip()
        hive_code = str(data.get("hive", "")).strip()
        date = str(data.get("date", "")).strip()
        method = str(data.get("method", "")).strip()

        try:
            quantity = float(data.get("quantity", 0))
        except (ValueError, TypeError):
            conn.close()
            return jsonify({"error": "Invalid quantity"}), 400

        if not all([collection_code, hive_code, date, method]) or quantity <= 0:
            conn.close()
            return jsonify({"error": "Please enter valid collection details"}), 400

        hive = conn.execute(
            "SELECT id FROM hives WHERE hive_code = ?",
            (hive_code,)
        ).fetchone()

        if not hive:
            conn.close()
            return jsonify({"error": "Hive ID not found. Please add the hive first."}), 404

        duplicate = conn.execute(
            "SELECT id FROM venomRecords WHERE collection_code = ?",
            (collection_code,)
        ).fetchone()

        if duplicate:
            conn.close()
            return jsonify({"error": "Collection ID already exists"}), 409

        conn.execute("""
            INSERT INTO venomRecords
            (hive_id, collection_code, hive_code, collection_date, quantity, method)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            hive["id"],
            collection_code,
            hive_code,
            date,
            quantity,
            method
        ))

        conn.commit()
        conn.close()

        return jsonify({"message": "Venom record saved successfully"}), 201

    rows = conn.execute("""
        SELECT collection_code, hive_code, collection_date, quantity, method
        FROM venomRecords
        ORDER BY id DESC
    """).fetchall()

    conn.close()
    return jsonify([dict(row) for row in rows])


# SENSOR API
@app.route("/api/sensor-readings", methods=["GET", "POST"])
def sensor_api():
    conn = get_db_connection()

    if request.method == "POST":
        data = request.get_json(silent=True) or {}

        try:
            temperature = float(data.get("temperature"))
            humidity = float(data.get("humidity"))
        except (ValueError, TypeError):
            conn.close()
            return jsonify({"error": "Invalid sensor values"}), 400

        conn.execute("""
            INSERT INTO sensorReadings (temperature, humidity)
            VALUES (?, ?)
        """, (temperature, humidity))

        conn.commit()
        conn.close()

        return jsonify({"message": "Sensor reading saved"}), 201

    row = conn.execute("""
        SELECT temperature, humidity, recorded_at
        FROM sensorReadings
        ORDER BY id DESC
        LIMIT 1
    """).fetchone()

    conn.close()

    if row:
        return jsonify(dict(row))

    return jsonify({
        "temperature": 32,
        "humidity": 65,
        "recorded_at": None
    })


# SENSOR HISTORY API
@app.route("/api/sensor-history")
def sensor_history():
    conn = get_db_connection()

    rows = conn.execute("""
        SELECT id, temperature, humidity, recorded_at
        FROM sensorReadings
        ORDER BY id DESC
        LIMIT 50
    """).fetchall()

    conn.close()

    return jsonify([dict(row) for row in rows])


if __name__ == "__main__":
    create_tables()
    app.run(debug=True)

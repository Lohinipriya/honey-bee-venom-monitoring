
// ========================================
// SENSOR AUTO REFRESH TIMER
// ========================================

let sensorRefreshTimer = null;
let sensorChart = null;


// ========================================
// LOGIN
// ========================================

const loginForm = document.getElementById("loginForm");

loginForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;

    if (username === "admin" && password === "12345") {

        document.getElementById("loginPage").style.display = "none";
        document.getElementById("dashboardPage").style.display = "block";
        document.getElementById("message").innerText = "";

        await loadHives();
        await loadVenomRecords();
        await loadSensorReadings();
        await loadSensorHistory();

        updateReports();

        startSensorAutoRefresh();

    } else {
        document.getElementById("message").innerText =
            "Invalid Username or Password!";
    }
});


// ========================================
// LOGOUT
// ========================================

function logout() {

    if (sensorRefreshTimer !== null) {
        clearInterval(sensorRefreshTimer);
        sensorRefreshTimer = null;
    }

    document.getElementById("dashboardPage").style.display = "none";
    document.getElementById("loginPage").style.display = "flex";

    loginForm.reset();

    document.getElementById("message").innerText = "";
}


// ========================================
// HIVE MANAGEMENT
// ========================================

const hiveForm = document.getElementById("hiveForm");


async function loadHives() {

    try {

        const response = await fetch("/api/hives");

        if (!response.ok) {
            throw new Error("Unable to load hives");
        }

        const hives = await response.json();

        const table = document.getElementById("hiveTable");
        table.innerHTML = "";

        hives.forEach(function (hive) {

            const row = table.insertRow();

            row.insertCell(0).innerText = hive.hive_code || "";
            row.insertCell(1).innerText = hive.location || "";
            row.insertCell(2).innerText = hive.bee_type || "";
            row.insertCell(3).innerText = hive.status || "";

        });

        document.getElementById("totalHives").innerText = hives.length;

        updateReports();

    } catch (error) {
        console.error("Hive loading error:", error);
    }
}


hiveForm.addEventListener("submit", async function (event) {

    event.preventDefault();

    const hiveData = {
        hiveId: document.getElementById("hiveId").value.trim(),
        location: document.getElementById("hiveLocation").value.trim(),
        beeType: document.getElementById("beeType").value.trim(),
        status: document.getElementById("hiveStatus").value
    };

    try {

        const response = await fetch("/api/hives", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(hiveData)
        });

        const result = await response.json();

        if (!response.ok) {
            alert(result.error || "Unable to save hive");
            return;
        }

        hiveForm.reset();

        await loadHives();

        alert("Hive Details Saved Successfully!");

    } catch (error) {

        console.error("Hive save error:", error);
        alert("Backend connection failed. Please check Flask.");

    }
});


// ========================================
// SENSOR MONITORING
// ========================================

async function loadSensorReadings() {

    try {

        const response = await fetch("/api/sensor-readings");

        if (!response.ok) {
            throw new Error("Unable to load sensor readings");
        }

        const data = await response.json();

        const temperature = Number(data.temperature);
        const humidity = Number(data.humidity);

        if (!Number.isFinite(temperature) ||
            !Number.isFinite(humidity)) {
            throw new Error("Invalid sensor readings");
        }

        document.getElementById("temperature").innerText =
            temperature + " °C";

        document.getElementById("humidity").innerText =
            humidity + " %";

        document.getElementById("dashboardTemperature").innerText =
            temperature + " °C";

        document.getElementById("dashboardHumidity").innerText =
            humidity + " %";

        document.getElementById("tempStatus").innerText =
            temperature > 35 ? "Warning" : "Normal";

        document.getElementById("humidityStatus").innerText =
            humidity > 70 ? "Warning" : "Normal";

        document.getElementById("sensorConnection").innerText =
            "Connected - Latest Database Reading";

    } catch (error) {

        console.error("Sensor loading error:", error);

        document.getElementById("sensorConnection").innerText =
            "Unable to load sensor readings";

    }
}


// ========================================
// SENSOR DATE FORMATTING
// ========================================

function formatLocalTime(dateTime) {

    if (!dateTime) return "N/A";

    const utcDate = new Date(dateTime.replace(" ", "T") + "Z");

    return utcDate.toLocaleString();
}


// ========================================
// SENSOR READING HISTORY
// ========================================

async function loadSensorHistory() {

    try {

        const response = await fetch("/api/sensor-history");

        if (!response.ok) {
            throw new Error("Unable to load sensor history");
        }

        const readings = await response.json();

        const table = document.getElementById("sensorHistoryTable");

        if (!table) {
            console.error("Sensor history table not found");
            return;
        }

        table.innerHTML = "";

        if (readings.length === 0) {

            const row = table.insertRow();
            const cell = row.insertCell(0);

            cell.colSpan = 4;
            cell.innerText = "No sensor readings available";

            renderSensorChart([]);

            return;
        }

        readings.forEach(function (reading, index) {

            const row = table.insertRow();

            row.insertCell(0).innerText = index + 1;

            row.insertCell(1).innerText =
                reading.temperature + " °C";

            row.insertCell(2).innerText =
                reading.humidity + " %";

            row.insertCell(3).innerText =
                formatLocalTime(reading.recorded_at);

        });

        // Update graph using database readings
        renderSensorChart(readings);

    } catch (error) {

        console.error("Sensor history loading error:", error);

        const table = document.getElementById("sensorHistoryTable");

        if (table) {
            table.innerHTML =
                '<tr><td colspan="4">Unable to load sensor history</td></tr>';
        }

    }
}


// ========================================
// TEMPERATURE AND HUMIDITY GRAPH
// ========================================

function renderSensorChart(readings) {

    const canvas = document.getElementById("sensorChart");

    if (!canvas) {
        console.error("Sensor graph canvas not found");
        return;
    }

    if (typeof Chart === "undefined") {
        console.error("Chart.js library not loaded");
        return;
    }

    // Convert database order into oldest-to-newest order
    const sortedReadings = [...readings].reverse();

    const labels = sortedReadings.map(function (reading) {

        return reading.recorded_at
            ? formatLocalTime(reading.recorded_at)
            : "Unknown";

    });

    const temperatureData = sortedReadings.map(function (reading) {
        return Number(reading.temperature);
    });

    const humidityData = sortedReadings.map(function (reading) {
        return Number(reading.humidity);
    });

    // Destroy old graph before creating updated graph
    if (sensorChart !== null) {
        sensorChart.destroy();
    }

    sensorChart = new Chart(canvas, {

        type: "line",

        data: {

            labels: labels,

            datasets: [

                {
                    label: "Temperature (°C)",
                    data: temperatureData,
                    borderColor: "rgb(255, 99, 71)",
                    backgroundColor: "rgba(255, 99, 71, 0.15)",
                    borderWidth: 2,
                    tension: 0.3,
                    fill: false,
                    yAxisID: "y"
                },

                {
                    label: "Humidity (%)",
                    data: humidityData,
                    borderColor: "rgb(54, 162, 235)",
                    backgroundColor: "rgba(54, 162, 235, 0.15)",
                    borderWidth: 2,
                    tension: 0.3,
                    fill: false,
                    yAxisID: "y1"
                }

            ]

        },

        options: {

            responsive: true,
            maintainAspectRatio: false,

            interaction: {
                mode: "index",
                intersect: false
            },

            plugins: {
                legend: {
                    display: true,
                    position: "top"
                },

                title: {
                    display: true,
                    text: "Sensor Reading Analysis"
                }
            },

            scales: {

                x: {
                    title: {
                        display: true,
                        text: "Date and Time"
                    }
                },

                y: {
                    type: "linear",
                    position: "left",
                    title: {
                        display: true,
                        text: "Temperature (°C)"
                    }
                },

                y1: {
                    type: "linear",
                    position: "right",
                    title: {
                        display: true,
                        text: "Humidity (%)"
                    },
                    grid: {
                        drawOnChartArea: false
                    }
                }

            }

        }

    });

}


// ========================================
// AUTOMATIC SENSOR REFRESH
// ========================================

function startSensorAutoRefresh() {

    if (sensorRefreshTimer !== null) {
        clearInterval(sensorRefreshTimer);
    }

    sensorRefreshTimer = setInterval(function () {

        loadSensorReadings();

    }, 10000);

}


// ========================================
// MANUAL DEMO SENSOR UPDATE
// ========================================

async function updateSensor() {

    const temperature = Math.floor(Math.random() * 10) + 28;
    const humidity = Math.floor(Math.random() * 20) + 55;

    try {

        const response = await fetch("/api/sensor-readings", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                temperature: temperature,
                humidity: humidity
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || "Unable to save sensor data");
        }

        await loadSensorReadings();

        // Refresh history and graph
        await loadSensorHistory();

        document.getElementById("sensorConnection").innerText =
            "Demo Mode - Sample Data Saved";

        alert("Sensor Readings Updated Successfully!");

    } catch (error) {

        console.error("Sensor update error:", error);

        alert("Unable to save sensor readings. Check Flask.");

    }
}


// ========================================
// VENOM COLLECTION
// ========================================

const venomForm = document.getElementById("venomForm");


async function loadVenomRecords() {

    try {

        const response = await fetch("/api/venom-records");

        if (!response.ok) {
            throw new Error("Unable to load collection records");
        }

        const records = await response.json();

        const table = document.getElementById("venomTable");
        table.innerHTML = "";

        records.forEach(function (record) {

            const row = table.insertRow();

            row.insertCell(0).innerText = record.collection_code || "";
            row.insertCell(1).innerText = record.hive_code || "";
            row.insertCell(2).innerText = record.collection_date || "";
            row.insertCell(3).innerText = record.quantity + " mg";
            row.insertCell(4).innerText = record.method || "";

        });

        updateReports();

    } catch (error) {
        console.error("Venom loading error:", error);
    }
}


venomForm.addEventListener("submit", async function (event) {

    event.preventDefault();

    const venomData = {
        collectionId: document.getElementById("collectionId").value.trim(),
        hive: document.getElementById("collectionHive").value.trim(),
        date: document.getElementById("collectionDate").value,
        quantity: document.getElementById("venomQuantity").value,
        method: document.getElementById("collectionMethod").value
    };

    try {

        const response = await fetch("/api/venom-records", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(venomData)
        });

        const result = await response.json();

        if (!response.ok) {
            alert(result.error || "Unable to save collection");
            return;
        }

        venomForm.reset();

        await loadVenomRecords();

        alert("Collection Record Saved Successfully!");

    } catch (error) {

        console.error("Venom save error:", error);
        alert("Backend connection failed. Please check Flask.");

    }
});


// ========================================
// REPORTS AND DASHBOARD
// ========================================

function updateReports() {

    const hiveRows = document.querySelectorAll("#hiveTable tr");
    const venomRows = document.querySelectorAll("#venomTable tr");

    let totalQuantity = 0;

    const reportTable = document.getElementById("reportTable");
    reportTable.innerHTML = "";

    venomRows.forEach(function (row) {

        const cells = row.cells;
        const quantity = parseFloat(cells[3].innerText);

        if (!isNaN(quantity)) {
            totalQuantity += quantity;
        }

        const reportRow = reportTable.insertRow();

        reportRow.insertCell(0).innerText = cells[0].innerText;
        reportRow.insertCell(1).innerText = cells[1].innerText;
        reportRow.insertCell(2).innerText = cells[2].innerText;
        reportRow.insertCell(3).innerText = cells[3].innerText;

    });

    document.getElementById("reportHives").innerText =
        hiveRows.length;

    document.getElementById("reportRecords").innerText =
        venomRows.length;

    document.getElementById("reportQuantity").innerText =
        totalQuantity.toFixed(1) + " mg";

    document.getElementById("totalHives").innerText =
        hiveRows.length;

    document.getElementById("dashboardVenom").innerText =
        totalQuantity.toFixed(1) + " mg";
}


// ========================================
// DOWNLOAD CSV REPORT
// ========================================

function downloadReport() {

    updateReports();

    const rows = document.querySelectorAll("#reportTable tr");

    let csv = "Collection ID,Hive ID,Date,Quantity\n";

    rows.forEach(function (row) {

        const values = Array.from(row.cells).map(function (cell) {

            return '"' + cell.innerText.replace(/"/g, '""') + '"';

        });

        csv += values.join(",") + "\n";

    });

    const blob = new Blob([csv], {
        type: "text/csv;charset=utf-8;"
    });

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;
    link.download = "Honey_Bee_Venom_Report.csv";

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
}

// -----------------------------
// Configurable emission factors
// -----------------------------
const EMISSION_FACTORS = {
  drivingKgPerMile: 0.404,
  flightTonsPerFlight: 0.25,
  electricityFactor: 0.0007,
  dietTonsByType: {
    "meat-heavy": 3.3,
    "average": 2.5,
    "vegetarian": 1.7,
    "vegan": 1.5,
  },
  consumptionTonsByLevel: {
    low: 0.8,
    average: 1.5,
    high: 2.5,
  },
  usAverageTons: 14.7,
  globalAverageTons: 4.7,
  // Slight calibration bump to account for emissions not captured in the simple form.
  estimateAdjustmentMultiplier: 1.15,
  // Estimated category shares for a U.S. average footprint.
  usAverageCategoryShares: {
    transportation: 0.36,
    diet: 0.17,
    electricity: 0.22,
    consumption: 0.25,
  },
};

const STORAGE_KEY = "climateCalculatorInputs";

// -----------------------------
// Shared helpers
// -----------------------------
function toSafeNumber(value) {
  const parsed = Number(value);
  if (Number.isNaN(parsed) || String(value).trim() === "") {
    return 0;
  }
  return parsed;
}

function formatTons(value) {
  return value.toFixed(2);
}

function calculateFootprint(inputs) {
  const annualMiles = inputs.milesPerWeek * 52;
  const drivingTons = (annualMiles * EMISSION_FACTORS.drivingKgPerMile) / 1000;
  const flightsTons = inputs.flightsPerYear * EMISSION_FACTORS.flightTonsPerFlight;
  const transportationTons =
    (drivingTons + flightsTons) * EMISSION_FACTORS.estimateAdjustmentMultiplier;

  const dietTons =
    EMISSION_FACTORS.dietTonsByType[inputs.dietType] * EMISSION_FACTORS.estimateAdjustmentMultiplier;
  const electricityTons =
    inputs.monthlyElectricityBill *
    12 *
    EMISSION_FACTORS.electricityFactor *
    EMISSION_FACTORS.estimateAdjustmentMultiplier;
  const consumptionTons =
    EMISSION_FACTORS.consumptionTonsByLevel[inputs.consumptionLevel] *
    EMISSION_FACTORS.estimateAdjustmentMultiplier;

  return {
    totalTons: transportationTons + dietTons + electricityTons + consumptionTons,
    categories: {
      transportation: transportationTons,
      diet: dietTons,
      electricity: electricityTons,
      consumption: consumptionTons,
    },
    details: {
      driving: drivingTons,
      flights: flightsTons,
      diet: dietTons,
      electricity: electricityTons,
      consumption: consumptionTons,
    },
  };
}

function buildSuggestions(details) {
  const suggestionMap = {
    driving:
      "Reduce solo driving by combining errands, carpooling, biking, walking, or using transit when possible.",
    flights: "Try reducing flights or combining trips to lower air travel emissions.",
    diet: "Lower diet emissions by reducing beef and adding more plant-based meals each week.",
    electricity:
      "Cut home energy use with efficient lighting/appliances, thermostat changes, and unplugging idle electronics.",
    consumption:
      "Buy fewer new products, repair what you can, and avoid unnecessary purchases to reduce consumption impact.",
  };

  const ranked = Object.entries(details).sort((a, b) => b[1] - a[1]);
  const selected = ranked.slice(0, 4).filter((entry) => entry[1] > 0);

  if (selected.length === 0) {
    return [
      "Great start. Keep tracking your habits and look for small weekly changes that reduce travel and energy use.",
      "Share your estimate with classmates and compare ideas for lowering emissions together.",
    ];
  }

  return selected.map(([key]) => suggestionMap[key]);
}

// -----------------------------
// Calculator page logic
// -----------------------------
function initCalculatorPage() {
  const form = document.getElementById("climate-form");
  if (!form) {
    return;
  }

  const resetBtn = document.getElementById("resetBtn");
  const formError = document.getElementById("formError");

  const milesInput = document.getElementById("milesPerWeek");
  const flightsInput = document.getElementById("flightsPerYear");
  const dietInput = document.getElementById("dietType");
  const billInput = document.getElementById("electricityBill");
  const consumptionInput = document.getElementById("consumptionLevel");

  function collectInputs() {
    return {
      milesPerWeek: toSafeNumber(milesInput.value),
      flightsPerYear: toSafeNumber(flightsInput.value),
      dietType: dietInput.value,
      monthlyElectricityBill: toSafeNumber(billInput.value),
      consumptionLevel: consumptionInput.value,
    };
  }

  function isValid(inputs) {
    const hasNegative =
      inputs.milesPerWeek < 0 || inputs.flightsPerYear < 0 || inputs.monthlyElectricityBill < 0;

    if (hasNegative) {
      formError.textContent = "Please enter only non-negative numbers.";
      return false;
    }

    formError.textContent = "";
    return true;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const inputs = collectInputs();
    if (!isValid(inputs)) {
      return;
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(inputs));
    window.location.href = "results.html";
  });

  resetBtn.addEventListener("click", () => {
    form.reset();
    formError.textContent = "";
  });
}

// -----------------------------
// Results page logic
// -----------------------------
function initResultsPage() {
  const totalOutput = document.getElementById("totalOutput");
  if (!totalOutput) {
    return;
  }

  const missingDataMessage = document.getElementById("missingDataMessage");
  const resultsContent = document.getElementById("resultsContent");
  const suggestionsList = document.getElementById("suggestionsList");
  const tryAgainBtn = document.getElementById("tryAgainBtn");

  let savedInputs = null;

  try {
    savedInputs = JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch (_error) {
    savedInputs = null;
  }

  if (!savedInputs) {
    missingDataMessage.classList.remove("hidden");
    resultsContent.classList.add("hidden");
    totalOutput.textContent = "0.00";
    return;
  }

  const result = calculateFootprint(savedInputs);
  totalOutput.textContent = formatTons(result.totalTons);

  const suggestions = buildSuggestions(result.details);
  suggestionsList.innerHTML = "";
  suggestions.forEach((text) => {
    const li = document.createElement("li");
    li.textContent = text;
    suggestionsList.appendChild(li);
  });

  // Render category pie chart.
  const userBreakdownCtx = document.getElementById("userBreakdownChart");
  new Chart(userBreakdownCtx, {
    type: "pie",
    data: {
      labels: ["Transportation", "Diet", "Electricity", "Consumption"],
      datasets: [
        {
          data: [
            result.categories.transportation,
            result.categories.diet,
            result.categories.electricity,
            result.categories.consumption,
          ],
          backgroundColor: ["#1f6f5e", "#3f8f7c", "#70b4a5", "#b9d9cf"],
          borderColor: "#ffffff",
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: "bottom",
        },
      },
    },
  });

  // Render U.S. average category pie chart using estimated share values.
  const usAverageCategories = {
    transportation: EMISSION_FACTORS.usAverageTons * EMISSION_FACTORS.usAverageCategoryShares.transportation,
    diet: EMISSION_FACTORS.usAverageTons * EMISSION_FACTORS.usAverageCategoryShares.diet,
    electricity: EMISSION_FACTORS.usAverageTons * EMISSION_FACTORS.usAverageCategoryShares.electricity,
    consumption: EMISSION_FACTORS.usAverageTons * EMISSION_FACTORS.usAverageCategoryShares.consumption,
  };

  const usAverageBreakdownCtx = document.getElementById("usAverageBreakdownChart");
  new Chart(usAverageBreakdownCtx, {
    type: "pie",
    data: {
      labels: ["Transportation", "Diet", "Electricity", "Consumption"],
      datasets: [
        {
          data: [
            usAverageCategories.transportation,
            usAverageCategories.diet,
            usAverageCategories.electricity,
            usAverageCategories.consumption,
          ],
          backgroundColor: ["#1f6f5e", "#3f8f7c", "#70b4a5", "#b9d9cf"],
          borderColor: "#ffffff",
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: "bottom",
        },
      },
    },
  });

  // Render user vs benchmark bar chart.
  const comparisonCtx = document.getElementById("comparisonChart");
  new Chart(comparisonCtx, {
    type: "bar",
    data: {
      labels: ["Your Total", "U.S. Average", "Global Average"],
      datasets: [
        {
          data: [result.totalTons, EMISSION_FACTORS.usAverageTons, EMISSION_FACTORS.globalAverageTons],
          backgroundColor: ["#1f6f5e", "#5b8c82", "#9ec5bb"],
          borderRadius: 8,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: "Metric tons CO2 per year",
          },
        },
      },
      plugins: {
        legend: {
          display: false,
        },
      },
    },
  });

  tryAgainBtn.addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
  });
}

// Initialize any page-specific behavior.
initCalculatorPage();
initResultsPage();

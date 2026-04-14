// Emission model constants
const EMISSION_MODEL = {
  // Aligned with values used in the uploaded Excel calculator assumptions tab.
  transportationKgPerMileByCarType: {
    // Excel uses 19.37 lb CO2/gal and 24.8 mpg with a 1.0136847 non-CO2 ratio:
    // (19.37 / 24.8 * 1.0136847) lb/mi = ~0.36 kg/mi
    gas: 0.36,
    // Keep simple relative scaling for hybrid/electric.
    hybrid: 0.18,
    electric: 0.135,
    none: 0,
  },
  flightDistanceKmByLength: {
    short: 500,
    medium: 1500,
    long: 4000,
  },
  flightKgPerKmByLength: {
    short: 0.15,
    medium: 0.13,
    long: 0.11,
  },
  // Excel assumptions tab values:
  // cost_per_kWh = 0.1609
  // EF electricity ~= 0.375 kg/kWh (derived from 8743.576 lb/yr at 880.5 kWh/mo)
  electricityPricePerKwh: 0.1609,
  electricityKgPerKwh: 0.375,
  // Natural_gas_cost_therm = 1.4672447
  // EF_natural_gas_therm = 11.664658 lb/therm ~= 5.29 kg/therm
  gasPricePerTherm: 1.467,
  gasKgPerTherm: 5.29,
  // Home energy share balancing
  homeEnergyShareTarget: 0.24,
  homeEnergyShareBlend: 0.45,
  homeEnergyMinAdjustment: 0.6,
  homeEnergyMaxAdjustment: 1.05,
  foodKgByDietType: {
    vegan: 1500,
    vegetarian: 2000,
    average: 2500,
    high_meat: 3000,
  },
  shoppingKgByFrequency: {
    very_little: 600,
    occasionally: 1100,
    regularly: 1700,
    frequently: 2600,
  },
  packageKgByMonthlyOrders: {
    "0_1": 50,
    "2_5": 150,
    "6_10": 300,
    "11_plus": 500,
  },
  usAverageTons: 14.7,
  globalAverageTons: 4.8,
  // Estimated shares for the U.S. average pie chart.
  usAverageCategoryShares: {
    transportation: 0.3,
    flights: 0.08,
    homeEnergy: 0.24,
    food: 0.18,
    consumption: 0.2,
  },
};

const STORAGE_KEY = "climateCalculatorInputs";
const KG_PER_TON = 1000;

// Shared helpers
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

function getPieChartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: {
        position: "bottom",
      },
      tooltip: {
        callbacks: {
          label(context) {
            const values = context.dataset.data || [];
            const total = values.reduce((sum, value) => sum + Number(value || 0), 0);
            const currentValue = Number(context.parsed || 0);
            const percent = total > 0 ? (currentValue / total) * 100 : 0;
            return `${context.label}: ${percent.toFixed(1)}%`;
          },
        },
      },
    },
  };
}

function calculateFootprint(inputs) {
  const missedEmissionsMultiplier = 1.2;
  const householdSize = Math.max(1, inputs.householdSize || 1);

  // Transportation
  const annualMiles = inputs.milesPerWeek * 52;
  const transportFactor = EMISSION_MODEL.transportationKgPerMileByCarType[inputs.carType] || 0;
  const transportKg = annualMiles * transportFactor;

  // Flights
  const flightDistance = EMISSION_MODEL.flightDistanceKmByLength[inputs.flightLength] || 0;
  const flightFactor = EMISSION_MODEL.flightKgPerKmByLength[inputs.flightLength] || 0;
  const flightKg = inputs.flightsPerYear * flightDistance * flightFactor;

  // Home energy
  const monthlyElectricBillPerPerson = inputs.monthlyElectricityBill / householdSize;
  const monthlyGasBillPerPerson = inputs.monthlyGasBill / householdSize;

  const monthlyKwh = monthlyElectricBillPerPerson / EMISSION_MODEL.electricityPricePerKwh;
  const annualKwh = monthlyKwh * 12;
  const electricKg = annualKwh * EMISSION_MODEL.electricityKgPerKwh;

  const monthlyTherms = monthlyGasBillPerPerson / EMISSION_MODEL.gasPricePerTherm;
  const annualTherms = monthlyTherms * 12;
  const gasKg = annualTherms * EMISSION_MODEL.gasKgPerTherm;

  const rawHomeKg = (electricKg + gasKg) * 1.2;

  // Food
  const foodKg = EMISSION_MODEL.foodKgByDietType[inputs.dietType] || 0;

  // Consumption
  const shoppingKg = EMISSION_MODEL.shoppingKgByFrequency[inputs.shoppingFrequency] || 0;
  const packageKg = EMISSION_MODEL.packageKgByMonthlyOrders[inputs.packagesPerMonth] || 0;
  const consumptionKg = shoppingKg + packageKg;

  // Gently pull home energy toward the 24% U.S. average share range.
  const otherKg = transportKg + flightKg + foodKg + consumptionKg;
  let homeKg = rawHomeKg;

  if (otherKg > 0) {
    const targetHomeKg =
      (EMISSION_MODEL.homeEnergyShareTarget * otherKg) /
      (1 - EMISSION_MODEL.homeEnergyShareTarget);
    const blendedHomeKg =
      rawHomeKg + (targetHomeKg - rawHomeKg) * EMISSION_MODEL.homeEnergyShareBlend;
    const minHomeKg = rawHomeKg * EMISSION_MODEL.homeEnergyMinAdjustment;
    const maxHomeKg = rawHomeKg * EMISSION_MODEL.homeEnergyMaxAdjustment;

    homeKg = Math.max(minHomeKg, Math.min(maxHomeKg, blendedHomeKg));
  }

  // Apply a final adjustment to each category for uncaptured emissions.
  const adjustedTransportKg = transportKg * missedEmissionsMultiplier;
  const adjustedFlightKg = flightKg * missedEmissionsMultiplier;
  const adjustedHomeKg = homeKg * missedEmissionsMultiplier;
  const adjustedFoodKg = foodKg * missedEmissionsMultiplier;
  const adjustedConsumptionKg = consumptionKg * missedEmissionsMultiplier;

  // Final total
  const totalKg =
    adjustedTransportKg +
    adjustedFlightKg +
    adjustedHomeKg +
    adjustedFoodKg +
    adjustedConsumptionKg;
  const totalTons = totalKg / KG_PER_TON;

  return {
    totalKg,
    totalTons,
    categoriesKg: {
      transportation: adjustedTransportKg,
      flights: adjustedFlightKg,
      homeEnergy: adjustedHomeKg,
      food: adjustedFoodKg,
      consumption: adjustedConsumptionKg,
    },
  };
}

// Calculator page logic
function initCalculatorPage() {
  const form = document.getElementById("climate-form");
  if (!form) {
    return;
  }

  const resetBtn = document.getElementById("resetBtn");
  const formError = document.getElementById("formError");

  const milesInput = document.getElementById("milesPerWeek");
  const carTypeInput = document.getElementById("carType");
  const flightsInput = document.getElementById("flightsPerYear");
  const flightLengthInput = document.getElementById("flightLength");
  const electricityBillInput = document.getElementById("electricityBill");
  const gasBillInput = document.getElementById("gasBill");
  const householdSizeInput = document.getElementById("householdSize");
  const dietInput = document.getElementById("dietType");
  const shoppingFrequencyInput = document.getElementById("shoppingFrequency");
  const packagesInput = document.getElementById("packagesPerMonth");

  function collectInputs() {
    return {
      milesPerWeek: toSafeNumber(milesInput.value),
      carType: carTypeInput.value,
      flightsPerYear: toSafeNumber(flightsInput.value),
      flightLength: flightLengthInput.value,
      monthlyElectricityBill: toSafeNumber(electricityBillInput.value),
      monthlyGasBill: toSafeNumber(gasBillInput.value),
      householdSize: toSafeNumber(householdSizeInput.value),
      dietType: dietInput.value,
      shoppingFrequency: shoppingFrequencyInput.value,
      packagesPerMonth: packagesInput.value,
    };
  }

  function isValid(inputs) {
    const hasNegative =
      inputs.milesPerWeek < 0 ||
      inputs.flightsPerYear < 0 ||
      inputs.monthlyElectricityBill < 0 ||
      inputs.monthlyGasBill < 0;
    const invalidHouseholdSize = inputs.householdSize < 1;

    if (hasNegative) {
      formError.textContent = "Please enter only non-negative numbers.";
      return false;
    }

    if (invalidHouseholdSize) {
      formError.textContent = "Household size must be at least 1.";
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

// Results page logic
function initResultsPage() {
  const totalOutput = document.getElementById("totalOutput");
  if (!totalOutput) {
    return;
  }

  const missingDataMessage = document.getElementById("missingDataMessage");
  const resultsContent = document.getElementById("resultsContent");
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

  const labels = ["Transportation", "Flights", "Home Energy", "Food", "Consumption"];
  const categoryOrder = ["transportation", "flights", "homeEnergy", "food", "consumption"];
  const userCategoryTons = categoryOrder.map((key) => result.categoriesKg[key] / KG_PER_TON);

  // Render user category pie chart.
  const userBreakdownCtx = document.getElementById("userBreakdownChart");
  new Chart(userBreakdownCtx, {
    type: "pie",
    data: {
      labels,
      datasets: [
        {
          data: userCategoryTons,
          backgroundColor: ["#1f6f5e", "#3f8f7c", "#5fa894", "#88c2b3", "#b9d9cf"],
          borderColor: "#ffffff",
          borderWidth: 2,
        },
      ],
    },
    options: getPieChartOptions(),
  });

  // Render U.S. average category pie chart using estimated share values.
  const usAverageCategoriesTons = {
    transportation: EMISSION_MODEL.usAverageTons * EMISSION_MODEL.usAverageCategoryShares.transportation,
    flights: EMISSION_MODEL.usAverageTons * EMISSION_MODEL.usAverageCategoryShares.flights,
    homeEnergy: EMISSION_MODEL.usAverageTons * EMISSION_MODEL.usAverageCategoryShares.homeEnergy,
    food: EMISSION_MODEL.usAverageTons * EMISSION_MODEL.usAverageCategoryShares.food,
    consumption: EMISSION_MODEL.usAverageTons * EMISSION_MODEL.usAverageCategoryShares.consumption,
  };

  const usAverageBreakdownCtx = document.getElementById("usAverageBreakdownChart");
  new Chart(usAverageBreakdownCtx, {
    type: "pie",
    data: {
      labels,
      datasets: [
        {
          data: categoryOrder.map((key) => usAverageCategoriesTons[key]),
          backgroundColor: ["#1f6f5e", "#3f8f7c", "#5fa894", "#88c2b3", "#b9d9cf"],
          borderColor: "#ffffff",
          borderWidth: 2,
        },
      ],
    },
    options: getPieChartOptions(),
  });

  // Render user vs benchmark bar chart.
  const comparisonCtx = document.getElementById("comparisonChart");
  new Chart(comparisonCtx, {
    type: "bar",
    data: {
      labels: ["Your Total", "U.S. Average", "Global Average"],
      datasets: [
        {
          data: [result.totalTons, EMISSION_MODEL.usAverageTons, EMISSION_MODEL.globalAverageTons],
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
            text: "Metric tons CO2e per year",
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

// Game variables
let auras = 0;
let clickValue = 1;
let autoClickers = 0;

let clickUpgradeCost = 10;
let autoClickerCost = 50;

// HTML elements
const auraCountEl = document.getElementById("auraCount");
const auraButton = document.getElementById("auraButton");
const clickUpgradeEl = document.getElementById("clickUpgrade");
const autoClickerEl = document.getElementById("autoClicker");
const clickUpgradeCostEl = document.getElementById("clickUpgradeCost");
const autoClickerCostEl = document.getElementById("autoClickerCost");

// Click aura button
auraButton.addEventListener("click", () => {
    auras += clickValue;
    updateDisplay();
});

// Upgrade click value
clickUpgradeEl.addEventListener("click", () => {
    if (auras >= clickUpgradeCost) {
        auras -= clickUpgradeCost;
        clickValue += 1; // Increase click by 1
        clickUpgradeCost = Math.floor(clickUpgradeCost * 1.5); // Increase cost
        clickUpgradeCostEl.textContent = clickUpgradeCost;
        updateDisplay();
    }
});

// Buy auto clicker
autoClickerEl.addEventListener("click", () => {
    if (auras >= autoClickerCost) {
        auras -= autoClickerCost;
        autoClickers += 1;
        autoClickerCost = Math.floor(autoClickerCost * 1.5);
        autoClickerCostEl.textContent = autoClickerCost;
        updateDisplay();
    }
});

// Auto clicker interval
setInterval(() => {
    auras += autoClickers * clickValue;
    updateDisplay();
}, 1000);

// Update the display
function updateDisplay() {
    auraCountEl.textContent = auras;
}

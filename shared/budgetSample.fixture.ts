import type { BudgetSimulationInput } from "./eventBudget";

/** Parecida a "PlayRoom x Dalmore": 620 personas, barra de $15.000 por persona. */
export const sample: BudgetSimulationInput = {
  ivaApplies: true,
  marginTargetPercent: 30,
  cardFeePercent: 3.5,
  commissionPercent: 0,
  variableCostPerPerson: 0,
  otherRevenuePerPerson: 15000,
  venueBarSharePercent: 10,
  extraIncomes: [{ label: "Estacionamiento", unitPrice: 5000, quantity: 120, venueCostPerUnit: 3000 }],
  revenueTiers: [
    { label: "ACCESO DÚO", price: 40000, expectedQty: 200, personasPorEntrada: 2 },
    { label: "ACCESO SOLTERA", price: 20000, expectedQty: 50, personasPorEntrada: 1 },
    { label: "ACCESO SOLTERO", price: 30000, expectedQty: 20, personasPorEntrada: 1 },
    { label: "ACCESO TRIPLE MIXTO", price: 50000, expectedQty: 10, personasPorEntrada: 3 },
    { label: "ACCESO POLI", price: 60000, expectedQty: 5, personasPorEntrada: 4 },
    { label: "Invitación Especial", price: 0, expectedQty: 100, personasPorEntrada: 1 },
  ],
  expenseLines: [
    { category: "arriendo", label: "Arriendo Hipódromo", amount: 2000000, ivaMode: "mas_iva" },
    { category: "barra", label: "Copete", amount: 1500000 },
    { category: "staff", label: "Staff", amount: 1500000 },
    { category: "produccion", label: "DJ y sonido", amount: 1200000 },
  ],
};


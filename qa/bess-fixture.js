'use strict';
// Illustrative QA inputs only. These are never application defaults or OEM claims.
/* A chosen catalogue model owns its make, ratings, price and backup state, so
   these manual values only survive when the fixture asks for the Custom model;
   without it the auto-selected Pylontech US5000 rewrites them on every render. */
module.exports={bessEnabled:true,bessModel:'custom',bessMake:'QA storage model',bessChemistry:'LFP',bessCapacity:'10',bessDod:'90',bessDischargeEff:'95',bessPower:'5',bessLoad:'2',bessBackupReady:'yes',bessCoupling:'dc',bessInverter:'QA hybrid inverter',bessCost:'300000',bessUseCase:'self',bessReserve:'20',bessRte:'90',bessCycles:'1',bessDays:'300',bessSourceEnergy:'10',bessDemand:'8',bessChargePower:'3',bessChargeHours:'4',bessDischargeHours:'5',bessImportRate:'15',bessSourceRate:'3',bessOm:'2000',bessLife:'12',bessWarranty:'Verify OEM cycle and service terms'};

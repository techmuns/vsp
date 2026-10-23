// The finance engine — pure, UI-free, framework-free. Screens call
// `computeSnapshot` with the raw records and a date range; everything else is
// internal. The accounting shape of money (what moves where) lives ONLY here.

export * from './money';
export * from './effect';
export * from './policy';
export * from './txnTypes';
export * from './portfolio';
export * from './compute';
export * from './reimbursements';
export * from './settlement';
export * from './budgets';
export * from './events';
export * from './summarize';
export * from './people';
export * from './breakdown';

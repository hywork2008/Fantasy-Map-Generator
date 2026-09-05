/**
 * Department shares before policy adjustments. Kept dependency-free so allocation policies
 * can share the contract without depending on the treasury allocation implementation.
 */
export interface DepartmentBaselineAllocation {
  marshalcy: number;
  household: number;
  chancery: number;
  stewardship: number;
  spymastery: number;
  ecclesiastica: number;
  /**
   * Roads, harbours and public granaries (docs/plan/economy-coupling-audit.md L8 stage 2).
   * The one department besides marshalcy whose balance is actually spent on something outside
   * the office holder's own purse — see publicWorks.ts.
   */
  publicWorks: number;
}

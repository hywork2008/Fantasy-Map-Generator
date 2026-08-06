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
}

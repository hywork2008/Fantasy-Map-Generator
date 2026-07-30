/** A burg's new-worker capacity for a single year; it does not model incumbent jobs. */
export interface UrbanLaborIntake {
  burgId: number;
  year: number;
  businessCycle: number;
  localVariation: number;
  offeredAdults: number;
  remainingAdults: number;
}

/** Adults expelled by rural labour allocation, awaiting a city, frontier, or outlaw outcome. */
export interface MobileAdultCohort {
  originCell: number;
  originState: number;
  maleAdults: number;
  femaleAdults: number;
  yearsSearching: number;
}

/** People outside a burg or rural cell who subsist through predation until later security work resolves them. */
export interface BanditCohort {
  originCell: number;
  targetState: number;
  maleAdults: number;
  femaleAdults: number;
  /** Consecutive quarters this cohort's raid fell 10%+ short of its basic food need. */
  consecutiveShortfallQuarters?: number;
}

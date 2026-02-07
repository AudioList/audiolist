import { STARTER_BUILDS, type StarterBuild } from './starterBuilds';

export interface QuizAnswers {
  genre: 'pop_rock' | 'classical' | 'hiphop' | 'electronic' | 'podcast' | 'mixed' | '';
  location: 'desk' | 'portable' | 'bed' | 'workout' | 'all' | '';
  budget: 'under50' | '50to150' | '150to500' | '500to1000' | 'over1000' | '';
  priority: 'quality' | 'comfort' | 'portability' | 'build' | 'value' | '';
  existingGear: 'none' | 'dac' | 'amp' | 'both' | '';
}

export interface QuizResult {
  recommended: StarterBuild;
  explanation: string;
  alternatives: StarterBuild[];
}

const BUDGET_TO_TIERS: Record<string, string[]> = {
  under50: ['$50'],
  '50to150': ['$150', '$50'],
  '150to500': ['$500', '$150'],
  '500to1000': ['$1000', '$500'],
  over1000: ['$1000'],
};

function budgetScore(build: StarterBuild, budget: string): number {
  const tiers = BUDGET_TO_TIERS[budget] ?? ['$500'];
  const idx = tiers.indexOf(build.tier);
  if (idx === 0) return 10;
  if (idx === 1) return 5;
  return 0;
}

function locationScore(build: StarterBuild, location: string): number {
  const isPortable = build.items.some((item) => item.categoryId === 'iem');
  const isDesktop = build.items.some((item) => item.categoryId === 'headphone');

  switch (location) {
    case 'portable':
    case 'workout':
      return isPortable ? 10 : 0;
    case 'desk':
      return isDesktop ? 10 : 3;
    case 'bed':
      return isPortable ? 6 : 4;
    case 'all':
      return 5;
    default:
      return 5;
  }
}

function priorityScore(build: StarterBuild, priority: string): number {
  switch (priority) {
    case 'value':
      return build.id === 'value-iem-bundle' ? 10 : build.tier === '$50' ? 7 : 3;
    case 'quality':
      return build.tier === '$1000' ? 10 : build.tier === '$500' ? 7 : 3;
    case 'portability':
      return build.items.some((i) => i.categoryId === 'iem') ? 8 : 2;
    case 'comfort':
      return build.items.some((i) => i.categoryId === 'headphone') ? 7 : 5;
    case 'build':
      // Desktop setups generally have better build quality
      return build.items.some((i) => i.categoryId === 'headphone') ? 7 : 5;
    default:
      return 5;
  }
}

function gearScore(build: StarterBuild, existingGear: string): number {
  const hasDac = build.items.some((i) => i.categoryId === 'dac');
  const hasAmp = build.items.some((i) => i.categoryId === 'amp');

  switch (existingGear) {
    case 'dac':
      // Already has a DAC, prefer builds that focus on amp + output
      return hasDac ? 3 : 7;
    case 'amp':
      // Already has an amp, prefer builds that focus on DAC + output
      return hasAmp ? 3 : 7;
    case 'both':
      // Has both, prefer output-only builds (IEM bundles etc)
      return !hasDac && !hasAmp ? 10 : 3;
    case 'none':
    default:
      // No gear, prefer complete builds
      return hasDac ? 7 : 5;
  }
}

function generateExplanation(build: StarterBuild, answers: QuizAnswers): string {
  const parts: string[] = [];

  // Budget context
  switch (answers.budget) {
    case 'under50':
      parts.push(`This ${build.name} build fits perfectly within your budget.`);
      break;
    case '50to150':
      parts.push(`At ~$${build.budget}, this build offers excellent value in your price range.`);
      break;
    case '150to500':
      parts.push(`This ${build.tier} build delivers serious performance at your budget level.`);
      break;
    case '500to1000':
      parts.push(`At ~$${build.budget}, this setup represents a significant step into enthusiast-grade audio.`);
      break;
    case 'over1000':
      parts.push(`This reference-level build gets you top-tier audio quality.`);
      break;
  }

  // Location context
  const isPortable = build.items.some((i) => i.categoryId === 'iem');
  if (answers.location === 'portable' || answers.location === 'workout') {
    if (isPortable) {
      parts.push('The IEM-based setup is ideal for on-the-go listening.');
    }
  } else if (answers.location === 'desk') {
    if (!isPortable) {
      parts.push('The desktop headphone setup is perfect for focused listening at your desk.');
    }
  }

  // Priority context
  if (answers.priority === 'value') {
    parts.push('Every component was chosen for maximum performance per dollar.');
  } else if (answers.priority === 'quality') {
    parts.push('These products are selected for their outstanding measurement performance.');
  }

  // Gear context
  if (answers.existingGear === 'both') {
    parts.push('Since you already have a DAC and amp, you can focus your budget entirely on the output.');
  } else if (answers.existingGear === 'dac') {
    parts.push('With your existing DAC, you can pair this with your current setup.');
  } else if (answers.existingGear === 'amp') {
    parts.push('Your existing amp will work great with these components.');
  }

  return parts.join(' ');
}

export function getRecommendation(answers: QuizAnswers): QuizResult {
  // Score each build
  const scored = STARTER_BUILDS.map((build) => {
    const score =
      budgetScore(build, answers.budget) * 3 +
      locationScore(build, answers.location) * 2 +
      priorityScore(build, answers.priority) * 1.5 +
      gearScore(build, answers.existingGear) * 1;

    return { build, score };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  const recommended = scored[0].build;
  const alternatives = scored
    .slice(1, 3)
    .map((s) => s.build);

  const explanation = generateExplanation(recommended, answers);

  return { recommended, explanation, alternatives };
}

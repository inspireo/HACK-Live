export interface QuestionOptionScore {
  driver?: number;
  champion?: number;
  futurist?: number;
  builder?: number;
}

export interface QuestionOption {
  text: string;
  scores?: QuestionOptionScore;
}

export interface OnboardingQuestion {
  id: string;
  type: 'wordcloud' | 'multiple_choice';
  text: string;
  placeholder?: string;
  options?: (string | QuestionOption)[];
  persistToProfile: boolean;
  showOnProjector: boolean;
  mode: 'anonymous' | 'identified';
}

export interface QuestionPack {
  id: string;
  title: string;
  description: string;
  category: 'General' | 'Mission Innovation' | 'Team Formation' | 'Experimental';
  questions: OnboardingQuestion[];
}

export const ARCHETYPES = {
  driver: {
    key: 'driver',
    label: 'Project Driver',
    emoji: '🚀',
    description: 'Brings focus, structures action plans, and keeps the group aligned to timelines and tangible progress.'
  },
  champion: {
    key: 'champion',
    label: 'User Champion',
    emoji: '🗣',
    description: 'Injects deep empathy, gathers user stories, and keeps the human experiences centered in all decisions.'
  },
  futurist: {
    key: 'futurist',
    label: 'Futurist',
    emoji: '✨',
    description: 'Expanse holder, challenges status quo constraints, and imagines bold, reimagined possibilities.'
  },
  builder: {
    key: 'builder',
    label: 'Builder',
    emoji: '🛠',
    description: 'Turns ideas into tactile things, designs prototype models, and tests practical solutions cleanly.'
  }
} as const;

export const QUESTION_PACKS: QuestionPack[] = [
  {
    id: 'welcome_icebreakers',
    title: 'Universal Welcome Icebreakers',
    description: 'Neutral, welcoming questions to gauge the room and gather warm icebreaker responses.',
    category: 'General',
    questions: [
      {
        id: 'q1',
        type: 'wordcloud',
        text: 'What brought you here today?',
        placeholder: 'e.g. Curious, Exploring, Here with my team, Inspiration',
        persistToProfile: false,
        showOnProjector: true,
        mode: 'anonymous'
      },
      {
        id: 'welcome_q1_hope',
        type: 'wordcloud',
        text: "What do you hope to get out of today's session?",
        placeholder: 'e.g. Connections, Skills, Clarity, Inspiration',
        persistToProfile: false,
        showOnProjector: true,
        mode: 'anonymous'
      },
      {
        id: 'univ_q2',
        type: 'multiple_choice',
        text: 'What are you hoping to contribute to your team?',
        options: [
          'Creative ideas & out-of-the-box thinking',
          'Practical structure, execution & timing',
          'Empathy, design research & user-focus',
          'Technical building & digital prototyping',
          'Encouragement & enthusiastic teamwork',
          'I’m still exploring where I can best contribute.'
        ],
        persistToProfile: false,
        showOnProjector: true,
        mode: 'anonymous'
      },
      {
        id: 'univ_q3',
        type: 'multiple_choice',
        text: 'What excites you most about collaborating with others?',
        options: [
          'Co-creating and mashing up different ideas',
          'Learning new techniques and mindsets',
          'Making real-world, tangible solutions together',
          'Connecting with passionate, like-minded people'
        ],
        persistToProfile: false,
        showOnProjector: true,
        mode: 'anonymous'
      }
    ]
  },
  {
    id: 'collaboration_archetypes',
    title: '👉 #HACK Collaboration Archetypes',
    description: 'Conversational, contribution-driven questions to discover participant collaboration leanings.',
    category: 'General',
    questions: [
      {
        id: 'arch_1',
        type: 'multiple_choice',
        text: 'When your team gets stuck, what is your natural instinct?',
        options: [
          { text: 'Refocus the group on our core goal and timeline', scores: { driver: 1 } },
          { text: "Make sure everyone's perspective is heard and they feel supported", scores: { champion: 1 } },
          { text: 'Introduce an out-of-the-box idea or pivot', scores: { futurist: 1 } },
          { text: 'Start sketching out a quick prototype to see what works', scores: { builder: 1 } },
          { text: '🌱 Still figuring out how I can best contribute.' }
        ],
        persistToProfile: true,
        showOnProjector: false,
        mode: 'identified'
      },
      {
        id: 'arch_2',
        type: 'multiple_choice',
        text: 'What excites you most during early-stage brainstorming?',
        options: [
          { text: 'Setting milestones and structuring the action plan', scores: { driver: 1 } },
          { text: 'Validating how real people will experience the ideas', scores: { champion: 1 } },
          { text: 'Imagining a bold, radical vision of the future', scores: { futurist: 1 } },
          { text: 'Figuring out the tech stack or building block mechanics', scores: { builder: 1 } },
          { text: '🌱 Still figuring out how I can best contribute.' }
        ],
        persistToProfile: true,
        showOnProjector: false,
        mode: 'identified'
      },
      {
        id: 'arch_3',
        type: 'multiple_choice',
        text: 'In a creative workshop, what input do you find most constructive?',
        options: [
          { text: 'Praise for keeping the task execution efficient and on schedule', scores: { driver: 1 } },
          { text: 'Feedback that deepens our empathy for the end user', scores: { champion: 1 } },
          { text: 'Ideas that expand our imagination beyond current limits', scores: { futurist: 1 } },
          { text: 'Review of our working draft or interactive mockup', scores: { builder: 1 } },
          { text: '🌱 Still figuring out how I can best contribute.' }
        ],
        persistToProfile: true,
        showOnProjector: false,
        mode: 'identified'
      },
      {
        id: 'arch_4',
        type: 'multiple_choice',
        text: 'If you could pick one perfect contribution in a 48-hour sprint, what is it?',
        options: [
          { text: 'The Choreographer: managing flow, slides, and our final pitch narrative', scores: { driver: 1 } },
          { text: 'The Advocate: talking to customers, gathering user stories and feedback', scores: { champion: 1 } },
          { text: 'The Visionary: crafting the concept narrative and big-picture foresight', scores: { futurist: 1 } },
          { text: 'The Maker: turning abstract concepts into tangible, demo-able prototypes', scores: { builder: 1 } },
          { text: '🌱 Still figuring out how I can best contribute.' }
        ],
        persistToProfile: true,
        showOnProjector: false,
        mode: 'identified'
      },
      {
        id: 'arch_5',
        type: 'multiple_choice',
        text: 'At the end of a long day of design thinking, what makes you feel successful?',
        options: [
          { text: 'We made solid progress and met every sprint milestone', scores: { driver: 1 } },
          { text: 'We understand who we are designing for on a deeper level', scores: { champion: 1 } },
          { text: 'We unlocked a novel perspective that hasn`t been done before', scores: { futurist: 1 } },
          { text: 'We have a concrete, working draft or interactive specimen', scores: { builder: 1 } },
          { text: '🌱 Still figuring out how I can best contribute.' }
        ],
        persistToProfile: true,
        showOnProjector: false,
        mode: 'identified'
      },
      {
        id: 'arch_6',
        type: 'multiple_choice',
        text: 'When presenting a new concept to stakeholders, what should be the hero?',
        options: [
          { text: 'The clear execution model, market viability, and immediate next steps', scores: { driver: 1 } },
          { text: 'The human story and emotional connection of the person we are helping', scores: { champion: 1 } },
          { text: 'The inspiring long-term vision of what this could become in ten years', scores: { futurist: 1 } },
          { text: 'The live, tangible demonstration of our practical working solution', scores: { builder: 1 } },
          { text: '🌱 Still figuring out how I can best contribute.' }
        ],
        persistToProfile: true,
        showOnProjector: false,
        mode: 'identified'
      }
    ]
  },
  {
    id: 'mission_icebreakers',
    title: 'Mission Innovation Icebreakers',
    description: 'Explicitly missional, ecosystem-focused opening questions to coordinate shared visions.',
    category: 'Mission Innovation',
    questions: [
      {
        id: 'q2',
        type: 'multiple_choice',
        text: 'How open are you to experimenting in missions?',
        options: [
          "I'm all in! Let's try anything.",
          "Pretty open, I like trying new things.",
          "Open, but I have some reservations.",
          "A bit cautious, but willing to listen.",
          "I prefer sticking to what we know works."
        ],
        persistToProfile: false,
        showOnProjector: true,
        mode: 'anonymous'
      },
      {
        id: 'mission_ice_2',
        type: 'wordcloud',
        text: 'Where do you see the biggest blockages or tensions in missional work today?',
        placeholder: 'e.g. Silos, Bureaucracy, Outdated tools, Fear of risk',
        persistToProfile: false,
        showOnProjector: true,
        mode: 'anonymous'
      },
      {
        id: 'mission_ice_3',
        type: 'multiple_choice',
        text: 'What excites you most about mission innovation?',
        options: [
          'Reaching people through novel digital platforms',
          'Accelerating collaboration across different organizations',
          'Rethinking systems & ministry with design thinking',
          'Unlocking volunteer talents in tech and design'
        ],
        persistToProfile: false,
        showOnProjector: true,
        mode: 'anonymous'
      }
    ]
  },
  {
    id: 'lausanne_lens',
    title: 'Lausanne Lens',
    description: 'Questions aligned with global cooperation and missional gaps.',
    category: 'Mission Innovation',
    questions: [
      {
        id: 'laus_1',
        type: 'wordcloud',
        text: 'What global or local gap are you most burning to see closed?',
        placeholder: 'e.g. Unreached groups, Bible translation, Mental health',
        persistToProfile: false,
        showOnProjector: true,
        mode: 'anonymous'
      },
      {
        id: 'laus_2',
        type: 'multiple_choice',
        text: 'How connected do you feel to the broader global or regional missional ecosystems?',
        options: [
          'Highly integrated and active',
          'Somewhat connected',
          'Aware, but mostly operating in our silo',
          'Isolated but seeking connections'
        ],
        persistToProfile: false,
        showOnProjector: true,
        mode: 'anonymous'
      }
    ]
  },
  {
    id: 'digital_ministry_signals',
    title: 'Digital Ministry Signals',
    description: 'Signals on church technology adoption, digital outreach readiness, and online strategy.',
    category: 'Mission Innovation',
    questions: [
      {
        id: 'dig_1',
        type: 'wordcloud',
        text: 'What word describes your ministry\'s current digital posture?',
        placeholder: 'e.g. Reactive, Pioneer, Traditional, Growing',
        persistToProfile: false,
        showOnProjector: true,
        mode: 'anonymous'
      },
      {
        id: 'dig_2',
        type: 'multiple_choice',
        text: 'What is the biggest roadblock to digital implementation in your context?',
        options: [
          'Limited technical skills',
          'Lack of leadership buy-in',
          'Budget constraints',
          'Unsure how to start / prioritize',
          'None, we are moving fast!'
        ],
        persistToProfile: false,
        showOnProjector: true,
        mode: 'anonymous'
      }
    ]
  },
  {
    id: 'working_preferences',
    title: 'Working Preferences',
    description: 'Lightweight signals to discover preferred team workspace styles and communication rhythms.',
    category: 'Team Formation',
    questions: [
      {
        id: 'wp_1',
        type: 'multiple_choice',
        text: 'Which environment helps your creative concentration peak?',
        options: [
          'Busy coffee shop with background hum',
          'Completely silent and secluded room',
          'Interactive brainstorm/war-room environment',
          'In nature or away from screens entirely'
        ],
        persistToProfile: true,
        showOnProjector: false,
        mode: 'identified'
      },
      {
        id: 'wp_2',
        type: 'multiple_choice',
        text: 'When drafting paper forms or rapid builds, what is your preferred speed?',
        options: [
          'Fast-paced draft iterations (rapid sprints)',
          'Deliberate and planned step-by-step logic',
          'Deep debate first, rapid alignment later',
          'Flexible, going with the group\'s natural flow'
        ],
        persistToProfile: true,
        showOnProjector: false,
        mode: 'identified'
      }
    ]
  },
  {
    id: 'ai_signals',
    title: 'AI Fluency',
    description: 'Lightweight signals around AI feelings, adaptation comfort, and daily usage mechanics.',
    category: 'Experimental',
    questions: [
      {
        id: 'ai_1',
        type: 'wordcloud',
        text: 'In one word, what is your primary feeling about generative AI today?',
        placeholder: 'e.g. Excited, Skeptical, Overwhelmed, Curious, Empathetic',
        persistToProfile: false,
        showOnProjector: true,
        mode: 'anonymous'
      },
      {
        id: 'ai_2',
        type: 'multiple_choice',
        text: 'How often do you incorporate AI into your creative or technical workflow?',
        options: [
          'Daily (integrated core assistant)',
          'Weekly (active exploration)',
          'Occasionally (sporadic lookup)',
          'Rarely or never'
        ],
        persistToProfile: true,
        showOnProjector: false,
        mode: 'identified'
      }
    ]
  },
  {
    id: 'innovation_readiness',
    title: 'Innovation Readiness',
    description: 'An interactive posture gauge regarding risk taking, testing speed, and pivoting agility.',
    category: 'Experimental',
    questions: [
      {
        id: 'ir_1',
        type: 'wordcloud',
        text: 'What is the greatest risk in NOT innovating this year?',
        placeholder: 'e.g. Stagnation, Irrelevance, Missed Gaps, Decline',
        persistToProfile: false,
        showOnProjector: true,
        mode: 'anonymous'
      },
      {
        id: 'ir_2',
        type: 'multiple_choice',
        text: 'How does your organization typically respond to a test failure?',
        options: [
          'It\'s seen as a negative event to avoid',
          'Analyzed carefully for lessons / normalized',
          'Celebrated as a fast prototype learning step',
          'We rarely build things that might fail'
        ],
        persistToProfile: false,
        showOnProjector: true,
        mode: 'anonymous'
      }
    ]
  },
  {
    id: 'mission_pulse',
    title: 'Mission Innovation Pulse',
    description: 'A high-level gauge of the room`s innovation capability and context.',
    category: 'Mission Innovation',
    questions: [
      {
        id: 'pulse_1',
        type: 'wordcloud',
        text: 'What represents our biggest opportunity for impact this month?',
        placeholder: 'e.g. Outreach, Technology, Empathy, Focus, Speed',
        persistToProfile: false,
        showOnProjector: true,
        mode: 'anonymous'
      },
      {
        id: 'pulse_2',
        type: 'multiple_choice',
        text: 'How confident are you that we can tackle our defined focus areas?',
        options: [
          "Extremely confident",
          "Optimistic with a clear plan",
          "Balanced / uncertain",
          "We need a massive pivot"
        ],
        persistToProfile: false,
        showOnProjector: true,
        mode: 'anonymous'
      }
    ]
  }
];

export function calculateArchetypeScores(responses: { questionId: string; response: string }[]) {
  const scores = { driver: 0, champion: 0, futurist: 0, builder: 0 };
  
  // Find all archetype questions
  const archPack = QUESTION_PACKS.find(p => p.id === 'collaboration_archetypes');
  if (!archPack) return scores;

  responses.forEach(r => {
    const q = archPack.questions.find(q => q.id === r.questionId);
    if (!q || !q.options) return;
    
    const selectedOption = q.options.find(opt => {
      const optText = typeof opt === 'string' ? opt : opt.text;
      return optText === r.response;
    });

    if (selectedOption && typeof selectedOption !== 'string' && selectedOption.scores) {
      Object.keys(selectedOption.scores).forEach(key => {
        if (key in scores) {
          (scores as any)[key] += (selectedOption.scores as any)[key];
        }
      });
    }
  });

  return scores;
}

export function getLeanings(scores: { driver: number; champion: number; futurist: number; builder: number }) {
  const sorted = Object.entries(scores)
    .filter(([_, val]) => val > 0)
    .sort((a, b) => b[1] - a[1]); // Descending
  
  const primary = sorted[0]?.[0] || null;
  const secondary = (sorted[1]?.[1] > 0 ? sorted[1]?.[0] : null) || null;
  
  return {
    primary: primary as 'driver' | 'champion' | 'futurist' | 'builder' | null,
    secondary: secondary as 'driver' | 'champion' | 'futurist' | 'builder' | null
  };
}

export function getAllQuestions() {
  const list: OnboardingQuestion[] = [];
  QUESTION_PACKS.forEach(p => {
    p.questions.forEach(q => {
      list.push(q);
    });
  });
  return list;
}

export function getQuestionById(id: string): OnboardingQuestion | undefined {
  return getAllQuestions().find(q => q.id === id);
}

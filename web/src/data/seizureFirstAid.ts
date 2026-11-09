// Seizure first aid, quoted word for word from the CDC page "First Aid for
// Seizures". Nothing is paraphrased or added. A test checks every line against
// seizureFirstAid.fixture.txt, which holds that page's own text.
// If this ever cannot be checked against the source, remove it rather than edit it.

export interface QuotedList {
  // A sentence the CDC page puts right before the heading, so it reads in context.
  intro?: string;
  heading: string;
  items: string[];
}

export const SEIZURE_BLOCKS: QuotedList[] = [
  {
    heading: "Steps to keeping a person safe during a seizure",
    items: [
      "Keep yourself and others calm.",
      "Stay with the person.",
      "Remove anything near them that can cause an injury.",
      "Check to see if they are wearing a medical bracelet for information about any medical conditions, medicines, and emergency contacts.",
      "If the person is lying down, turn them gently on their side, with their mouth pointing to the ground. This will keep their airway clear.",
      "Time the seizure to track if it lasts more than 5 minutes. If it does, seek immediate medical attention or call 911.",
      "When the seizure is over, help them sit in a safe place to recover.",
      "Once they are alert, comfort them and explain what happened.",
      "Offer to call a friend or loved one to help them get home safely.",
    ],
  },
  {
    intro: "Seizures don\u2019t usually require emergency medical attention.",
    heading: "But you should call 911 if one or more of these things happen:",
    items: [
      "The seizure lasts longer than 5 minutes.",
      "They have another seizure soon after the first one.",
      "They have trouble breathing or waking up after the seizure.",
      "They are injured during the seizure.",
      "The seizure happens in water.",
    ],
  },
  {
    heading:
      "It is also important to call 911 if the person having the seizure:",
    items: [
      "Has never had a seizure before.",
      "Has diabetes and loses consciousness.",
      "Is pregnant.",
    ],
  },
  {
    heading: "Don't take these actions",
    items: [
      "Don't hold the person down or stop their movements. This could injure you or them.",
      "Don't put anything in their mouth. This can hurt their teeth or jaw.",
      "Don't give mouth-to-mouth breaths during the seizure. People usually start breathing again on their own after a seizure.",
      "Don't offer water or food until they are fully alert. This is not necessary and could cause them to choke.",
    ],
  },
];

export const SEIZURE_SOURCE_URL =
  "https://www.cdc.gov/epilepsy/first-aid-for-seizures/index.html";
export const SEIZURE_SOURCE_LINE = `Source: Centers for Disease Control and Prevention, ${SEIZURE_SOURCE_URL}, checked Nov 9, 2026`;

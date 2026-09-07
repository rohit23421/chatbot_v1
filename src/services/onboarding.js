/**
 * Defines the ordered demographic questions asked to every new user
 * before they reach normal AI conversation. Add/remove/reorder freely —
 * everything else in this file adapts automatically.
 */
export const ONBOARDING_STEPS = [
    {
        key: "ask_name",
        field: "name",
        question: "Hey there! 👋 Welcome — what's your name?",
    },
    {
        key: "ask_age",
        field: "age",
        question: "Nice to meet you! How old are you?",
    },
    {
        key: "ask_city",
        field: "city",
        question: "Which city are you in?",
    },
    {
        key: "ask_occupation",
        field: "occupation",
        question: "Last one — what do you do for work or study?",
    },
];

export function getFirstQuestion() {
    return ONBOARDING_STEPS[0].question;
}

export function getFieldForStep(stepKey) {
    const step = ONBOARDING_STEPS.find((s) => s.key === stepKey);
    return step?.field ?? null;
}

/**
 * Given the CURRENT step (the one whose question was just answered),
 * returns the key of the next step — or 'done' if that was the last one.
 */
export function getNextStep(currentStepKey) {
    const index = ONBOARDING_STEPS.findIndex((s) => s.key === currentStepKey);
    const isLastStep = index === -1 || index === ONBOARDING_STEPS.length - 1;
    return isLastStep ? "done" : ONBOARDING_STEPS[index + 1].key;
}

/**
 * Returns the question text for a given step, or null if that step
 * doesn't exist (e.g. onboarding_step is already 'done').
 */
export function getQuestionForStep(stepKey) {
    const step = ONBOARDING_STEPS.find((s) => s.key === stepKey);
    return step?.question ?? null;
}

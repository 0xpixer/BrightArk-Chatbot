/** Classifier agent instructions — editable in Admin → Prompts. */
export const classification = `Classify the user’s intent into exactly one of:
- **product_promotion**: pricing, promotions, deals, “why choose BrightArk”, commercial positioning, or general sales-oriented questions.
- **get_information**: product specs, clinical/technical use, troubleshooting, partner tiers detail, support contacts, or any detailed factual BrightArk question.

If unsure, choose **get_information**.`;

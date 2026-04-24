/**
 * Machine-readable OAPP build plan carried in assistant replies inside
 * a fenced ```oasis-build-plan ... ``` block (IDE parses for the Build plan panel).
 */

export interface OappTemplateRecommendation {
  /** Short title, e.g. "Community missions (Expo)" */
  label: string;
  /** Primary framework: expo, vite, next, react-native, unity, other */
  framework: string;
  /** In-repo recipe path or template id when known */
  templatePathOrId?: string;
  rationale?: string;
}

export interface OappBuildPlanHolonFeature {
  /** Stable id for UI selection (slug, no spaces preferred) */
  id: string;
  catalogHolonName?: string;
  catalogId?: string;
  /** What we implement in the app using this holon */
  feature: string;
  roleInApp?: string;
  /** Default true when omitted */
  selected?: boolean;
}

export interface OappBuildPlanPayload {
  templateRecommendation?: OappTemplateRecommendation;
  holonFeatures?: OappBuildPlanHolonFeature[];
}

export interface OappBuildPlanHolonRow extends OappBuildPlanHolonFeature {
  selected: boolean;
}

export const BADGE_DISCLAIMER =
  "Educational achievement — not a professional certification or license";

export type SkillBadgeProps = {
  badgeId: string;
  title: string;
  holderName: string;
};

export function skillBadgeRenderModel(props: SkillBadgeProps) {
  return {
    ...props,
    disclaimer: BADGE_DISCLAIMER,
    labels: {
      article: `${props.title} badge`,
      holder: props.holderName,
    },
  };
}

export function SkillBadge(props: SkillBadgeProps) {
  const model = skillBadgeRenderModel(props);
  return (
    <article aria-label={model.labels.article} data-badge-id={model.badgeId}>
      <h2>{model.title}</h2>
      <p>{model.holderName}</p>
      <p>{model.disclaimer}</p>
    </article>
  );
}

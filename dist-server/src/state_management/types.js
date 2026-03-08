/** Resolve an instance's effective props by merging prototype defaults with instance overrides. */
export function resolveProps(prototype, instance) {
    return { ...prototype.props, ...instance.props };
}

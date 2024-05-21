export function createMarkerDecorator() {
    // deno-lint-ignore no-explicit-any
    return (..._args: unknown[]): any => {
        throw new Error("Marker decorator does not processed.");
    };
}

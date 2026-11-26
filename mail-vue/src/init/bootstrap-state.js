// Shared startup state.
//
// Kept in its own module because both the bootstrap (init.js) and the router
// guard need it, and importing one from the other would create a cycle. The
// guard must know whether bootstrap has finished before it decides that a token
// without an identity is stale.
export const bootstrapState = {
    // Set once bootstrap has either succeeded or definitively failed.
    settled: false,
    configReady: false,
    identityReady: false,
    error: null
};

export default bootstrapState;
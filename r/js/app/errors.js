/** Base class for all custom error classes */
export class AppError extends Error {
}

/** An error that indicates a potential bug in the app. */
export class BugCheck extends AppError {
}

/** An error that indicates invalid data. */
export class DataError extends AppError {
}

/** An rrror that indicates a function hasn't yet been implemented. */
export class NotImplementedError extends BugCheck {
}

/** An error that indicates that an action can't be performed
 *  in the current state.
 */
export class StateError extends AppError {
}

// @shishan function status-widget
// @summary Render the current JavaScript status
export function StatusWidget({ ready }) {
  // @shishan branch choose-label
  // @summary Choose the visible status label
  // @condition the widget is ready
  if (ready) {
    // @shishan step render-ready
    // @summary Render the ready state
    return <strong>Ready</strong>;
  }

  // @shishan step render-pending
  // @summary Render the pending state
  return <span>Pending</span>;
}

type StatusProps = {
  ready: boolean;
};

// @shishan function status-widget
// @summary Render the current TypeScript status
export function StatusWidget({ ready }: StatusProps) {
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

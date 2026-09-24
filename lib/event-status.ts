/** One expression for the status displayed, filtered and sorted by the events API.
 * Event dates are inclusive calendar days, matching the existing UI contract.
 */
export const EVENT_STATUS_SQL = `CASE
  WHEN CURRENT_DATE < e."startDate"::date THEN 'Upcoming'
  WHEN CURRENT_DATE > e."endDate"::date THEN 'Completed'
  ELSE 'Active'
END`

export function getAppointmentOccupiedEnd(startTime, durationMinutes, bufferAfterMinutes = 0) {
  const duration = Number(durationMinutes || 0);
  const buffer = Number(bufferAfterMinutes || 0);
  return new Date(
    new Date(startTime).getTime() + Math.max(0, duration + buffer) * 60000,
  );
}

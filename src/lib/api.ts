export async function saveRecord(collection: string, data: any, userEmail?: string) {
  const response = await fetch(`/api/records/${collection}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...data,
      userEmail,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to save record');
  }

  return response.json();
}

export async function getRecords(collection: string) {
  const response = await fetch(`/api/records/${collection}`);
  if (!response.ok) {
    throw new Error('Failed to fetch records');
  }
  return response.json();
}

export async function deleteRecord(collection: string, id: string) {
  const response = await fetch(`/api/records/${collection}/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error('Failed to delete record');
  }
  return response.json();
}

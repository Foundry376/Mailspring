import {
  SUCCESS_STORE_ROOMS,
} from '../actions/db/room';

const initialState = {
  rooms: {},
};

function processRoomsData(data) {
  const rooms = {};
  for (const item of data) {
    rooms[item.jid] = item.name
  }
  return rooms;
}

export default function roomReducer(state = initialState, { type, payload }) {
  switch (type) {
    case SUCCESS_STORE_ROOMS:
      var rooms = processRoomsData(payload);
      rooms = Object.assign({}, state.rooms, rooms);
      return Object.assign({}, { rooms });
    default:
      return state;
  }
}

import MailspringStore from 'mailspring-store';
import DatabaseStore from './database-store';
import Thread from '../models/thread';

class ThreadStore extends MailspringStore{
  constructor(){
    super();
  }
  findBy({ threadId }) {
    return DatabaseStore.findBy(Thread, {id: threadId, state: 0});
  }
  findAll(){
    return DatabaseStore.findAll(Thread,{state: 0});
  }
  findAllByThreadIds({threadIds}){
    return this.findAll().where([Thread.attributes.id.in(threadIds)]);
  }
}

const store = new ThreadStore();
export default store;
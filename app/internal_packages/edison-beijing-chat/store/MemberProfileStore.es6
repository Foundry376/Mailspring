import MailspringStore from 'mailspring-store';

class MemberProfileStore extends MailspringStore {
  constructor(){
    super();
    this.member = null;
    return;
  }

  setMember = (member) => {
    const clickSame = member && member === this.member;
    this.member = member;
    if (!clickSame){
      this.trigger();
    }
  }
}

module.exports = new MemberProfileStore();

import { bindActionCreators } from 'redux';
import { connect } from 'react-redux';
import HomePage from '../components/home/HomePage';
import { submitAuth } from '../actions/auth';

const actionCreators = {
  submitAuth
};

const mapStateToProps = state => ({
  isAuthenticating: state.auth.isAuthenticating
});

const mapDispatchToProps = dispatch => bindActionCreators(actionCreators, dispatch);

export default connect(mapStateToProps, mapDispatchToProps)(HomePage);

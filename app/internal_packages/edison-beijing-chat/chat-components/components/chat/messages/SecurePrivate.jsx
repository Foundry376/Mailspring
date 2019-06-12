import { RetinaImg } from 'mailspring-component-kit';
import React from 'react';

export default () => (
    <div className='secure-private'>
        <div className='lock-icon'>
            <RetinaImg name={'lock.svg'}
                style={{ width: 24, height: 24 }}
                isIcon
                mode={RetinaImg.Mode.ContentIsMask} />
        </div>
        <div className='secure-detail'>
            <div className='subtitle'>
                Secure & Private
            </div>
            <div className="private-detail">
                Messages in this chat are secured with end-to-end encryption. <a href="http://www.edison.tech/privacy.html">Learn More</a>
            </div>
        </div>
    </div>
)